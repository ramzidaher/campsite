import { redirect } from 'next/navigation';

/** @deprecated Use `/admin/teams`. */
export default function AdminSubTeamsRedirectPage() {
  redirect('/admin/teams');
}
