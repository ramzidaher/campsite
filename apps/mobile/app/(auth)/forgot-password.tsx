import { AuthChrome } from '@/components/auth/AuthChrome';
import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm';

export default function ForgotPasswordScreen() {
  return (
    <AuthChrome hideOrgCard>
      <ForgotPasswordForm />
    </AuthChrome>
  );
}
