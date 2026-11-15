import type { Express, Router, RequestHandler } from "express";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import {
  createProject,
  listProjects,
  updateProject,
  createTeam,
  updateTeam,
  teamInclude,
} from "../services/management.js";
import { requireCapability } from "../middleware/auth.js";
import { requireValue } from "../services/errors.js";
const wrap =
  (fn: (req: any, res: any) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res)).catch(next);
  };
const uuid = z.string().uuid();
export function registerProjectRoutes(app: Express, prisma: PrismaClient) {
  app.get(
    "/api/v1/projects",
    wrap(async (req, res) => {
      const query = z
        .object({
          includeArchived: z.enum(["true", "false"]).default("false"),
          search: z.string().max(200).optional(),
          status: z
            .enum(["PLANNED", "ACTIVE", "ON_HOLD", "COMPLETED", "ARCHIVED"])
            .optional(),
        })
        .parse(req.query);
      let data = await listProjects(
        prisma,
        req.identity.id,
        query.includeArchived === "true" || query.status === "ARCHIVED",
      );
      if (query.status) data = data.filter((p) => p.status === query.status);
      if (query.search) {
        const term = query.search.toLowerCase();
        data = data.filter((p) =>
          `${p.name} ${p.key} ${p.description}`.toLowerCase().includes(term),
        );
      }
      res.json({ data });
    }),
  );
  app.post(
    "/api/v1/projects",
    wrap(async (req, res) =>
      res
        .status(201)
        .json({ data: await createProject(prisma, req.identity.id, req.body) }),
    ),
  );
}
export function registerWorkspaceManagement(
  router: Router,
  prisma: PrismaClient,
) {
  router.get(
    "/",
    wrap(async (req, res) =>
      res.json({
        data: {
          ...requireValue(
            await prisma.project.findUnique({
              where: { id: req.projectId },
              include: { owner: { select: { id: true, name: true } } },
            }),
          ),
          currentRole: req.role,
        },
      }),
    ),
  );
  router.patch(
    "/",
    requireCapability("project:edit"),
    wrap(async (req, res) =>
      res.json({
        data: await updateProject(
          prisma,
          req.projectId,
          req.identity.id,
          req.body,
        ),
      }),
    ),
  );
  router.get(
    "/teams",
    wrap(async (req, res) => {
      const query = z
        .object({ includeArchived: z.enum(["true", "false"]).default("false") })
        .parse(req.query);
      res.json({
        data: await prisma.team.findMany({
          where: {
            projectId: req.projectId,
            ...(query.includeArchived === "true" ? {} : { archivedAt: null }),
          },
          include: teamInclude,
          orderBy: { name: "asc" },
        }),
      });
    }),
  );
  router.get(
    "/teams/:id",
    wrap(async (req, res) =>
      res.json({
        data: requireValue(
          await prisma.team.findFirst({
            where: { id: uuid.parse(req.params.id), projectId: req.projectId },
            include: teamInclude,
          }),
        ),
      }),
    ),
  );
  router.post(
    "/teams",
    requireCapability("teams:manage"),
    wrap(async (req, res) =>
      res
        .status(201)
        .json({
          data: await createTeam(
            prisma,
            req.projectId,
            req.identity.id,
            req.body,
          ),
        }),
    ),
  );
  router.patch(
    "/teams/:id",
    requireCapability("teams:manage"),
    wrap(async (req, res) =>
      res.json({
        data: await updateTeam(
          prisma,
          req.projectId,
          req.identity.id,
          uuid.parse(req.params.id),
          req.body,
        ),
      }),
    ),
  );
}
