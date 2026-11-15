import express, { type Express } from "express";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

export function registerFrontend(
  app: Express,
  directory = resolve(
    existsSync("frontend/package.json") ? "frontend/dist" : "../frontend/dist",
  ),
) {
  const root = resolve(directory);
  const index = resolve(root, "index.html");
  if (!existsSync(index)) throw Error("Frontend build is missing");
  app.use((req, res, next) => {
    if (req.path === "/api" || req.path.startsWith("/api/")) return next();
    if (req.path.split("/").some((part) => part.startsWith(".")))
      return res.sendStatus(404);
    express.static(root, { dotfiles: "deny", index: false })(
      req,
      res,
      (error) => {
        if (error) return next(error);
        if (
          !["GET", "HEAD"].includes(req.method) ||
          req.path.startsWith("/assets/") ||
          !req.accepts("html")
        )
          return next();
        res.setHeader("Cache-Control", "no-cache");
        res.sendFile(index);
      },
    );
  });
}
