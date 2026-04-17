import { redirect } from 'next/navigation';

export default async function ManagerRecruitmentPage() {
  redirect('/hr/hiring/requests');
}
