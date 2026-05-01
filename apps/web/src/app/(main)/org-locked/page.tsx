import { redirect } from 'next/navigation';

export default function OrgLockedPage() {
  redirect('/forbidden');
}
