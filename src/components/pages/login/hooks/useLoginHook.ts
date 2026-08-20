import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { isLoginError } from "@/lib/loginErrors";

const UNEXPECTED_LOGIN_ERROR =
  "Er is een onverwachte fout opgetreden tijdens het inloggen";

export const useLoginHook = (onLoginSuccess: () => void) => {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { login: authLogin } = useAuth();

  const login = async (usernameOrEmail: string, password: string) => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const loginSuccess = await authLogin(usernameOrEmail, password);

      if (loginSuccess) {
        onLoginSuccess();
        return;
      }

      setErrorMessage("Gebruikersnaam/e-mail of wachtwoord is onjuist.");
    } catch (error) {
      const message = isLoginError(error)
        ? error.message
        : UNEXPECTED_LOGIN_ERROR;
      if (!isLoginError(error)) {
        console.error("Login error:", error);
      }
      setErrorMessage(message);
      toast({
        title: "Login mislukt",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return { login, isLoading, errorMessage };
};
