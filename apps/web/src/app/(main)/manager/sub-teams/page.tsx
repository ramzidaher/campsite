import { redirect } from 'next/navigation';

/** @deprecated Use `/manager/teams`. */
export default function ManagerSubTeamsRedirectPage() {
  redirect('/manager/teams');
}
