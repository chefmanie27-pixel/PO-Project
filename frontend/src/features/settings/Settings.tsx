import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useWorkspace } from "../../app/Workspace";
import { useProjectMutation, useProjectQuery } from "../../hooks/useProject";
import { PageHeader, ErrorState, StatusBadge } from "../../components/ui";
import { api, send } from "../../services/api";
import { SignOutButton } from "../auth/Auth";
export function Settings() {
  const { profile, projects, projectId, role } = useWorkspace();
  const project = projects.find((p: any) => p.id === projectId);
  const members = useProjectQuery("/memberships");
  const mutation = useProjectMutation(),
    cache = useQueryClient();
  const [notice, setNotice] = useState("");
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
                notifications: values.notifications === "on",
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
            <label className="checkbox">
              <input
                type="checkbox"
                name="notifications"
                defaultChecked={profile.notifications}
              />
              Enable notification preference (delivery planned)
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
          <form
            onSubmit={(e) => {
              e.preventDefault();
              mutation.mutate(
                { path: "/", method: "PATCH", data: formData(e.currentTarget) },
                {
                  onSuccess: () => {
                    setNotice("Project saved.");
                    void cache.invalidateQueries({ queryKey: ["profile"] });
                  },
                },
              );
            }}
          >
            <label>
              Name
              <input
                name="name"
                defaultValue={project.name}
                disabled={role !== "ADMIN"}
                required
                minLength={2}
              />
            </label>
            <label>
              Description
              <textarea
                name="description"
                defaultValue={project.description}
                disabled={role !== "ADMIN"}
              />
            </label>
            <label>
              Ticket prefix
              <input value={project.key} readOnly />
            </label>
            {role === "ADMIN" && (
              <button className="primary" disabled={mutation.isPending}>
                Save project
              </button>
            )}
          </form>
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
        {role === "ADMIN" && (
          <section className="panel detail-panel">
            <h2>Team configuration</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                mutation.mutate(
                  { path: "/teams", data: formData(form) },
                  {
                    onSuccess: () => {
                      form.reset();
                      setNotice("Team created.");
                    },
                  },
                );
              }}
            >
              <label>
                Name
                <input name="name" required minLength={2} />
              </label>
              <label>
                Description
                <textarea name="description" />
              </label>
              <button disabled={mutation.isPending}>Create team</button>
            </form>
          </section>
        )}
      </div>
      {(mutation.error || updateProfile.error) && (
        <ErrorState error={(mutation.error || updateProfile.error)!} />
      )}
    </>
  );
}
