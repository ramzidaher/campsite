import { redirect } from 'next/navigation';

export default function TrialEndedPage() {
  redirect('/dashboard');
}
