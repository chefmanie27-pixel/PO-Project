import { Link, useParams, type LinkProps } from "react-router-dom";
export function ProjectLink({ to, ...props }: LinkProps) {
  const { projectId } = useParams();
  const target =
    projectId &&
    typeof to === "string" &&
    to.startsWith("/") &&
    !to.startsWith("/projects")
      ? `/projects/${projectId}${to}`
      : to;
  return <Link to={target} {...props} />;
}
