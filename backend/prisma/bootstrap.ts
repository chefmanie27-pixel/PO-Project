import "dotenv/config";
import { getFirebaseAdminAuth } from "../src/config/firebase.js";
import { db } from "../src/config/db.js";
const uid = process.env.BOOTSTRAP_ADMIN_UID,
  email = process.env.BOOTSTRAP_ADMIN_EMAIL;
if (!uid || !email)
  throw new Error(
    "Set explicitly trusted BOOTSTRAP_ADMIN_UID and BOOTSTRAP_ADMIN_EMAIL.",
  );
try {
  const account = await getFirebaseAdminAuth().getUser(uid);
  if (account.email?.toLowerCase() !== email.toLowerCase() || account.disabled)
    throw new Error(
      "Trusted UID/email does not match an active Firebase identity.",
    );
  await db.$transaction(async (tx) => {
    const user = await tx.user.upsert({
      where: { firebaseUid: uid },
      create: {
        firebaseUid: uid,
        email,
        name: account.displayName || email.split("@")[0],
      },
      update: {},
    });
    const project = await tx.project.upsert({
      where: { key: "PO" },
      create: {
        key: "PO",
        name: "Product workspace",
        description: "Shared software delivery",
      },
      update: {},
    });
    await tx.projectMembership.upsert({
      where: { projectId_userId: { projectId: project.id, userId: user.id } },
      create: { projectId: project.id, userId: user.id, role: "ADMIN" },
      update: {},
    });
    await tx.team.createMany({
      data: [
        "Platform",
        "Experience",
        "Commerce",
        "Identity",
        "Insights",
        "Quality",
      ].map((name) => ({
        projectId: project.id,
        name,
        description: `${name} development team`,
      })),
      skipDuplicates: true,
    });
  });
  console.log(
    "Trusted administrator bootstrap complete. Existing memberships were preserved.",
  );
} finally {
  await db.$disconnect();
}
