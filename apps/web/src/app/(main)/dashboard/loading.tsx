// No loader here — the post-login overlay in LoginForm covers the cold-start
// to dashboard. Subsequent in-app navigations to dashboard are fast enough
// that a skeleton would just flash.
export default function DashboardLoading() {
  return null;
}
