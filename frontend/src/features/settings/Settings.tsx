import { ProjectEditor } from "../projects/Projects";
import { ProjectLink } from "../../components/ProjectLink";
import { hasCapability } from "../../../../shared/permissions";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useWorkspace } from "../../app/Workspace";
import { useProjectMutation, useProjectQuery } from "../../hooks/useProject";
import { PageHeader, ErrorState, StatusBadge } from "../../components/ui";
import { api, send } from "../../services/api";
import { SignOutButton } from "../auth/Auth";
export function Settings() {
  const { profile, project, role } = useWorkspace();
  const members = useProjectQuery("/memberships");
  const mutation = useProjectMutation(),
    cache = useQueryClient();
  const [notice, setNotice] = useState("");
  const [editProject, setEditProject] = useState(false);
  const updateProfile = useMutation({
    mutationFn: (data: any) => api("/profile", send("PATCH", data)),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ["profile"] });
      setNotice("Profile saved.");
    },
  });
  const formData = (form: HTMLFormElement) =>
    Object.fromEntries(new FormData(form));
  return (
    <>
      <PageHeader
        eyebrow="YOUR WORKSPACE"
        title="Settings"
        description="Manage your profile, project and access."
      />
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      <div className="settings-grid">
        <section className="panel detail-panel">
          <h2>Your profile</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const values = formData(e.currentTarget);
              updateProfile.mutate({
                name: values.name,
              });
            }}
          >
            <label>
              Name
              <input
                name="name"
                defaultValue={profile.name}
                required
                minLength={2}
              />
            </label>
            <label>
              Email
              <input value={profile.email} readOnly />
            </label>
            <button className="primary" disabled={updateProfile.isPending}>
              Save profile
            </button>
          </form>
          <SignOutButton className="sign-out">
            Sign out of your account
          </SignOutButton>
          <p className="muted small">
            Contact an administrator for account removal or membership changes.
          </p>
        </section>
        <section className="panel detail-panel">
          <h2>Project information</h2>
          <h3>{project.name}</h3>
          <p>{project.description}</p>
          <p className="muted">Project code: {project.key}</p>
          {hasCapability(role, "project:edit") && !project.archivedAt && (
            <button onClick={() => setEditProject(true)}>Edit project</button>
          )}{" "}
        </section>
        <section className="panel detail-panel">
          <h2>Project memberships</h2>
          {members.data?.data.map((m: any) => (
            <div className="membership" key={m.id}>
              <span>
                {m.user.name}
                <small>{m.user.email}</small>
              </span>
              <StatusBadge value={m.role} />
            </div>
          ))}
          {role === "ADMIN" && (
            <>
              <h3>Grant or update access</h3>
              <p className="muted small">
                Create the account in Firebase first. Enter its trusted UID and
                email. Existing identities retain their profile.
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  mutation.mutate(
                    { path: "/memberships", data: formData(form) },
                    {
                      onSuccess: () => {
                        form.reset();
                        setNotice("Project membership saved.");
                      },
                    },
                  );
                }}
              >
                <label>
                  Firebase UID
                  <input name="firebaseUid" required />
                </label>
                <label>
                  Email
                  <input type="email" name="email" required />
                </label>
                <label>
                  Display name
                  <input name="name" required minLength={2} />
                </label>
                <label>
                  Project role
                  <select name="role">
                    <option value="PRODUCT_OWNER">Product Owner</option>
                    <option value="ADMIN">Administrator</option>
                  </select>
                </label>
                <button disabled={mutation.isPending}>Save membership</button>
              </form>
            </>
          )}
        </section>
        <section className="panel detail-panel">
          <h2>Team configuration</h2>
          <p>
            Manage custom teams, ownership and archive status in this project.
          </p>
          <ProjectLink to="/teams">Manage project teams ?</ProjectLink>
        </section>
      </div>
      {editProject && (
        <ProjectEditor
          project={project}
          profile={profile}
          onClose={() => {
            setEditProject(false);
            setNotice("Project saved.");
          }}
        />
      )}
      {(mutation.error || updateProfile.error) && (
        <ErrorState error={(mutation.error || updateProfile.error)!} />
      )}
    </>
  );
}
