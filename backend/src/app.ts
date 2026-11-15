import express, { type RequestHandler } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { pinoHttp } from "pino-http";
import { z, ZodError } from "zod";
import { Prisma, type PrismaClient } from "@prisma/client";
import { db } from "./config/db.js";
import { authenticate, membership, admin } from "./middleware/auth.js";
import { projectRoles, hasCapability } from "../../shared/permissions.js";
import { ApiError, requireValue } from "./services/errors.js";
import {validateInvitedIdentity} from './services/invitations.js';
import {
  createTicket,
  updateTicket,
  addDependency,
  reorderTicket,
  audit,
  validateLinks,
} from "./services/tickets.js";
import {
  sprintSchema,
  blockerSchema,
  reviewSchema,
  decisionSchema,
  reviewIndicators,
  statuses,
  priorities,
} from "../../shared/schemas.js";
const wrap =
  (
    fn: (req: express.Request, res: express.Response) => Promise<unknown>,
  ): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res)).catch(next);
  };
const uuid = z.string().uuid();
const pageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export function createApp(
  prisma: PrismaClient = db,
  auth: RequestHandler = authenticate,
) {
  const app = express();
  app.disable("x-powered-by");
  app.use(
    helmet(),
    cors({ origin: process.env.WEB_ORIGIN || "http://localhost:5173" }),
    express.json({ limit: "128kb" }),
    pinoHttp({
      enabled: process.env.NODE_ENV !== "test",
      redact: ["req.headers.authorization"],
    }),
    rateLimit({ windowMs: 60000, limit: 300 }),
  );
  app.get("/api/v1/health", (_req, res) =>
    res.json({ data: { status: "ok" } }),
  );
  app.use("/api/v1", auth);
  app.get(
    "/api/v1/profile",
    wrap(async (req, res) =>
      res.json({
        data: await prisma.user.findUnique({
          where: { id: req.identity.id },
          include: { memberships: { include: { project: true } } },
        }),
      }),
    ),
  );
  app.patch(
    "/api/v1/profile",
    wrap(async (req, res) => {
      const data = z
        .object({
          name: z.string().trim().min(2).max(100).optional(),
          notifications: z.boolean().optional(),
        })
        .parse(req.body);
      res.json({
        data: await prisma.user.update({
          where: { id: req.identity.id },
          data,
        }),
      });
    }),
  );
  app.get(
    "/api/v1/projects",
    wrap(async (req, res) =>
      res.json({
        data: await prisma.project.findMany({
          where: {
            memberships: {
              some: {
                userId: req.identity.id,
                role: {
                  in: projectRoles.filter((role) =>
                    hasCapability(role, "project:read"),
                  ),
                },
              },
            },
          },
        }),
      }),
    ),
  );
  const router = express.Router({ mergeParams: true });
  app.use(
    "/api/v1/projects/:projectId",
    (req, _res, next) => {
      try {
        uuid.parse(req.params.projectId);
        next();
      } catch (e) {
        next(e);
      }
    },
    membership(prisma),
    router,
  );
  router.get(
    "/",
    wrap(async (req, res) =>
      res.json({
        data: await prisma.project.findUnique({ where: { id: req.projectId } }),
      }),
    ),
  );
  router.patch(
    "/",
    admin,
    wrap(async (req, res) => {
      const data = z
        .object({
          name: z.string().trim().min(2).max(100),
          description: z.string().max(3000),
        })
        .parse(req.body);
      res.json({
        data: await prisma.$transaction(async (tx) => {
          const result = await tx.project.update({
            where: { id: req.projectId },
            data,
          });
          await audit(
            tx,
            req.projectId,
            req.identity.id,
            "project.updated",
            req.projectId,
            data,
          );
          return result;
        }),
      });
    }),
  );
  router.get(
    "/memberships",
    wrap(async (req, res) =>
      res.json({
        data: await prisma.projectMembership.findMany({
          where: { projectId: req.projectId },
          include: { user: { select: { id: true, name: true, email: true } } },
        }),
      }),
    ),
  );
  router.post(
    "/memberships",
    admin,
    wrap(async (req, res) => {
      const input = z
        .object({
          firebaseUid: z.string().min(1).max(128),
          email: z.string().email(),
          name: z.string().min(2).max(100),
          role: z.enum(["ADMIN", "PRODUCT_OWNER"]),
        })
        .parse(req.body);
      await validateInvitedIdentity(input.firebaseUid,input.email);
      res.status(201).json({
        data: await prisma.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${req.projectId}::uuid FOR UPDATE`;
          const user = await tx.user.upsert({
            where: { firebaseUid: input.firebaseUid },
            create: {
              firebaseUid: input.firebaseUid,
              email: input.email,
              name: input.name,
            },
            update: {},
          });
          const previous = await tx.projectMembership.findUnique({
            where: {
              projectId_userId: { projectId: req.projectId, userId: user.id },
            },
          });
          if (
            previous?.role === "ADMIN" &&
            input.role !== "ADMIN" &&
            (await tx.projectMembership.count({
              where: { projectId: req.projectId, role: "ADMIN" },
            })) <= 1
          )
            throw new ApiError(
              400,
              "Keep at least one administrator in this project",
            );
          const result = await tx.projectMembership.upsert({
            where: {
              projectId_userId: { projectId: req.projectId, userId: user.id },
            },
            create: {
              projectId: req.projectId,
              userId: user.id,
              role: input.role,
            },
            update: { role: input.role },
          });
          await audit(
            tx,
            req.projectId,
            req.identity.id,
            "membership.granted",
            result.id,
            { userId: user.id, role: input.role },
          );
          return result;
        }),
      });
    }),
  );
  router.get(
    "/tickets",
    wrap(async (req, res) => {
      const { page, limit } = pageSchema.parse(req.query);
      const filters = z
        .object({
          search: z.string().max(200).optional(),
          status: z.enum(statuses).optional(),
          priority: z.enum(priorities).optional(),
          sprintId: uuid.optional(),
          teamId: uuid.optional(),
          ownerId: uuid.optional(),
          sort: z
            .enum(["rank", "updatedAt", "createdAt", "title", "priority"])
            .default("rank"),
          direction: z.enum(["asc", "desc"]).default("asc"),
        })
        .parse(req.query);
      const { search, sort, direction, ...rest } = filters;
      const where: Prisma.TicketWhereInput = {
        projectId: req.projectId,
        archivedAt: null,
        ...rest,
        ...(search
          ? {
              OR: [
                { title: { contains: search, mode: "insensitive" } },
                { identifier: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      };
      const [data, total] = await prisma.$transaction([
        prisma.ticket.findMany({
          where,
          include: {
            owner: true,
            team: true,
            sprint: true,
            blockers: { where: { status: { not: "RESOLVED" } } },
          },
          orderBy: [{ [sort]: direction }, { id: "asc" }],
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.ticket.count({ where }),
      ]);
      res.json({ data, meta: { page, limit, total } });
    }),
  );
  router.post(
    "/tickets",
    wrap(async (req, res) =>
      res.status(201).json({
        data: await createTicket(
          prisma,
          req.projectId,
          req.identity.id,
          req.body,
        ),
      }),
    ),
  );
  router.post(
    "/tickets/:id/reorder",
    wrap(async (req, res) => {
      const { version, direction } = z
        .object({
          version: z.number().int().positive(),
          direction: z.enum(["up", "down"]),
        })
        .parse(req.body);
      res.json({
        data: await reorderTicket(
          prisma,
          req.projectId,
          req.identity.id,
          uuid.parse(req.params.id),
          version,
          direction,
        ),
      });
    }),
  );
  router.patch(
    "/tickets/:id",
    wrap(async (req, res) =>
      res.json({
        data: await updateTicket(
          prisma,
          req.projectId,
          req.identity.id,
          uuid.parse(req.params.id),
          req.body,
        ),
      }),
    ),
  );
  router.get(
    "/tickets/:id",
    wrap(async (req, res) => {
      res.json({
        data: requireValue(
          await prisma.ticket.findFirst({
            where: { id: uuid.parse(req.params.id), projectId: req.projectId },
            include: {
              owner: true,
              team: true,
              sprint: true,
              parent: true,
              children: true,
              dependencies: { include: { dependsOn: true } },
              comments: {
                include: { author: true },
                orderBy: { createdAt: "asc" },
              },
              blockers: true,
              decisions: { include: { decision: true } },
              reviews: true,
            },
          }),
        ),
      });
    }),
  );
  router.post(
    "/tickets/:id/comments",
    wrap(async (req, res) => {
      const ticketId = uuid.parse(req.params.id);
      const { body } = z
        .object({ body: z.string().trim().min(1).max(10000) })
        .parse(req.body);
      res.status(201).json({
        data: await prisma.$transaction(async (tx) => {
          await validateLinks(tx, req.projectId, { ticketId });
          const result = await tx.comment.create({
            data: { ticketId, body, authorId: req.identity.id },
          });
          await audit(
            tx,
            req.projectId,
            req.identity.id,
            "comment.created",
            ticketId,
            { commentId: result.id },
          );
          return result;
        }),
      });
    }),
  );
  router.post(
    "/tickets/:id/dependencies",
    wrap(async (req, res) =>
      res.status(201).json({
        data: await addDependency(
          prisma,
          req.projectId,
          req.identity.id,
          uuid.parse(req.params.id),
          z.object({ dependsOnId: uuid }).parse(req.body).dependsOnId,
        ),
      }),
    ),
  );
  router.delete(
    "/tickets/:id/dependencies/:target",
    wrap(async (req, res) => {
      const ticketId = uuid.parse(req.params.id),
        dependsOnId = uuid.parse(req.params.target);
      await prisma.$transaction(async (tx) => {
        await tx.ticketDependency.deleteMany({
          where: { projectId: req.projectId, ticketId, dependsOnId },
        });
        await audit(
          tx,
          req.projectId,
          req.identity.id,
          "dependency.removed",
          ticketId,
          { dependsOnId },
        );
      });
      res.json({ data: { removed: true } });
    }),
  );
  router.get(
    "/sprints",
    wrap(async (req, res) =>
      res.json({
        data: await prisma.sprint.findMany({
          where: { projectId: req.projectId },
          include: {
            tickets: {
              where: { archivedAt: null },
              include: { blockers: { where: { status: { not: "RESOLVED" } } } },
            },
          },
          orderBy: { startDate: "asc" },
        }),
      }),
    ),
  );
  router.post(
    "/sprints",
    wrap(async (req, res) => {
      const data = sprintSchema.parse(req.body);
      res.status(201).json({
        data: await prisma.$transaction(async (tx) => {
          const sprint = await tx.sprint.create({
            data: { ...data, projectId: req.projectId },
          });
          await audit(
            tx,
            req.projectId,
            req.identity.id,
            "sprint.created",
            sprint.id,
            data,
          );
          return sprint;
        }),
      });
    }),
  );
  router.patch(
    "/sprints/:id",
    wrap(async (req, res) => {
      const data = sprintSchema.parse(req.body),
        id = uuid.parse(req.params.id);
      res.json({
        data: await prisma.$transaction(async (tx) => {
          requireValue(
            await tx.sprint.findFirst({
              where: { id, projectId: req.projectId },
            }),
          );
          const sprint = await tx.sprint.update({ where: { id }, data });
          await audit(
            tx,
            req.projectId,
            req.identity.id,
            "sprint.updated",
            id,
            data,
          );
          return sprint;
        }),
      });
    }),
  );
  router.get(
    "/teams",
    wrap(async (req, res) =>
      res.json({
        data: await prisma.team.findMany({
          where: { projectId: req.projectId },
          include: {
            tickets: {
              where: { archivedAt: null },
              include: {
                owner: true,
                blockers: { where: { status: { not: "RESOLVED" } } },
              },
            },
          },
          orderBy: { name: "asc" },
        }),
      }),
    ),
  );
  router.post(
    "/teams",
    admin,
    wrap(async (req, res) => {
      const data = z
        .object({
          name: z.string().min(2).max(100),
          description: z.string().max(3000).default(""),
        })
        .parse(req.body);
      res.status(201).json({
        data: await prisma.$transaction(async (tx) => {
          const team = await tx.team.create({
            data: { ...data, projectId: req.projectId },
          });
          await audit(
            tx,
            req.projectId,
            req.identity.id,
            "team.created",
            team.id,
            data,
          );
          return team;
        }),
      });
    }),
  );
  for (const [path, model, schema] of [
    ["blockers", "blocker", blockerSchema],
    ["reviews", "reviewItem", reviewSchema],
    ["decisions", "decision", decisionSchema],
  ] as const) {
    router.get(
      `/${path}`,
      wrap(async (req, res) => {
        const { page, limit } = pageSchema.parse(req.query);
        const where = { projectId: req.projectId };
        const data = await (prisma[model] as any).findMany({
          where,
          orderBy: { updatedAt: "desc" },
          take: limit,
          skip: (page - 1) * limit,
          include:
            model === "decision"
              ? { maker: true, tickets: { include: { ticket: true } } }
              : { owner: true, ticket: true },
        });
        const total = await (prisma[model] as any).count({ where });
        res.json({ data, meta: { page, limit, total } });
      }),
    );
    router.post(
      `/${path}`,
      wrap(async (req, res) => {
        const input = schema.parse(req.body) as any;
        res.status(201).json({
          data: await prisma.$transaction(async (tx) => {
            await validateLinks(tx, req.projectId, input);
            const { ticketIds, ...data } = input;
            if (model === "decision") {
              for (const ticketId of ticketIds)
                await validateLinks(tx, req.projectId, { ticketId });
              data.makerId = req.identity.id;
            }
            if (model === "blocker" && data.status === "RESOLVED") {
              if (!data.resolutionNotes.trim())
                throw new ApiError(400, "Resolution notes are required");
              data.resolvedAt = new Date();
            }
            const result = await (tx[model] as any).create({
              data: {
                ...data,
                projectId: req.projectId,
                ...(ticketIds
                  ? {
                      tickets: {
                        create: ticketIds.map((ticketId: string) => ({
                          projectId: req.projectId,
                          ticketId,
                        })),
                      },
                    }
                  : {}),
              },
            });
            await audit(
              tx,
              req.projectId,
              req.identity.id,
              `${model}.created`,
              result.id,
              data,
            );
            return result;
          }),
        });
      }),
    );
    router.patch(
      `/${path}/:id`,
      wrap(async (req, res) => {
        const version = z.number().int().positive().parse(req.body.version);
        const input = schema.parse(req.body) as any;
        const id = uuid.parse(req.params.id);
        res.json({
          data: await prisma.$transaction(async (tx) => {
            const current = requireValue<any>(
              await (tx[model] as any).findFirst({
                where: { id, projectId: req.projectId },
              }),
            );
            if (current.version !== version)
              throw new ApiError(
                409,
                "This record changed. Refresh and reconcile your edits.",
              );
            await validateLinks(tx, req.projectId, input);
            const { ticketIds, ...data } = input;
            if (model === "blocker") {
              if (data.status === "RESOLVED" && !data.resolutionNotes.trim())
                throw new ApiError(400, "Resolution notes are required");
              data.resolvedAt = data.status === "RESOLVED" ? new Date() : null;
            }
            const result = await (tx[model] as any).updateMany({
              where: { id, projectId: req.projectId, version },
              data: { ...data, version: { increment: 1 } },
            });
            if (result.count !== 1)
              throw new ApiError(
                409,
                "This record changed. Refresh and reconcile your edits.",
              );
            if (ticketIds) {
              for (const ticketId of ticketIds)
                await validateLinks(tx, req.projectId, { ticketId });
              await tx.decisionTicket.deleteMany({
                where: { decisionId: id, projectId: req.projectId },
              });
              await tx.decisionTicket.createMany({
                data: ticketIds.map((ticketId: string) => ({
                  decisionId: id,
                  projectId: req.projectId,
                  ticketId,
                })),
                skipDuplicates: true,
              });
            }
            await audit(
              tx,
              req.projectId,
              req.identity.id,
              `${model}.updated`,
              id,
              { before: current, after: data, ticketIds },
            );
            return (tx[model] as any).findUnique({ where: { id } });
          }),
        });
      }),
    );
  }
  router.get(
    "/review-indicators",
    wrap(async (req, res) => {
      const tickets = await prisma.ticket.findMany({
        where: {
          projectId: req.projectId,
          archivedAt: null,
          status: { not: "DONE" },
        },
      });
      res.json({ data: tickets.flatMap(reviewIndicators) });
    }),
  );
  router.get(
    "/audit-events",
    wrap(async (req, res) => {
      const { page, limit } = pageSchema.parse(req.query);
      const entityId = z.string().max(100).optional().parse(req.query.entityId);
      res.json({
        data: await prisma.auditEvent.findMany({
          where: {
            projectId: req.projectId,
            ...(entityId ? { entityId } : {}),
          },
          include: { actor: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * limit,
          take: limit,
        }),
      });
    }),
  );
  router.get(
    "/dashboard",
    wrap(async (req, res) => {
      const filters = z
        .object({
          sprintId: uuid.optional(),
          teamId: uuid.optional(),
          ownerId: uuid.optional(),
        })
        .parse(req.query);
      const projectId = req.projectId;
      const tickets = await prisma.ticket.findMany({
        where: { projectId, archivedAt: null, ...filters },
        include: {
          blockers: { where: { status: { not: "RESOLVED" } } },
          team: true,
          owner: true,
        },
        orderBy: { updatedAt: "desc" },
      });
      const ids = tickets.map((t) => t.id);
      const filtered = Object.values(filters).some(Boolean);
      const [sprints, decisions, reviews, blockers] = await Promise.all([
        prisma.sprint.findMany({
          where: {
            projectId,
            ...(filters.sprintId ? { id: filters.sprintId } : {}),
          },
          orderBy: { startDate: "asc" },
        }),
        prisma.decision.findMany({
          where: {
            projectId,
            ...(filtered
              ? { tickets: { some: { ticketId: { in: ids } } } }
              : {}),
          },
          orderBy: { updatedAt: "desc" },
          take: 5,
        }),
        prisma.reviewItem.findMany({
          where: {
            projectId,
            status: "OPEN",
            ...(filtered ? { ticketId: { in: ids } } : {}),
          },
        }),
        prisma.blocker.findMany({
          where: {
            projectId,
            status: { not: "RESOLVED" },
            ...(filtered ? { ticketId: { in: ids } } : {}),
          },
          include: { ticket: true },
        }),
      ]);
      const counts = Object.fromEntries(
        statuses.map((s) => [s, tickets.filter((t) => t.status === s).length]),
      );
      res.json({
        data: {
          total: tickets.length,
          counts,
          blocked: tickets.filter((t) => t.blockers.length).length,
          recent: tickets.slice(0, 6),
          sprints,
          decisions,
          reviews,
          blockers,
          indicators: tickets
            .filter((t) => t.status !== "DONE")
            .flatMap(reviewIndicators),
        },
      });
    }),
  );
  app.use((_req, _res, next) => next(new ApiError(404, "Endpoint not found")));
  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      if (error instanceof ZodError) {
        res.status(400).json({
          error: { message: "Validation failed", issues: error.flatten() },
        });
        return;
      }
      if (error instanceof ApiError) {
        res.status(error.status).json({ error: { message: error.message } });
        return;
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        res.status(409).json({
          error: { message: "A record with this identifier already exists" },
        });
        return;
      }
      if (error instanceof SyntaxError) {
        res.status(400).json({ error: { message: "Invalid JSON request" } });
        return;
      }
      console.error(error);
      res
        .status(500)
        .json({ error: { message: "Unable to complete this request" } });
    },
  );
  return app;
}
