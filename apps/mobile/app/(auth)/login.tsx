import { LoginForm } from '@/components/auth/LoginForm';
import { AuthChrome } from '@/components/auth/AuthChrome';

export default function LoginScreen() {
  return (
    <AuthChrome hideOrgCard>
      <LoginForm />
    </AuthChrome>
  );
}
