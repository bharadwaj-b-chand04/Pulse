"use client";

import { useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { TriangleAlertIcon } from "lucide-react";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader } from "@/components/ui/card";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Link, useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api";
import { useApiErrorMessage, useFieldErrors } from "@/lib/errors";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 12;

export default function RegisterPage() {
  const t = useTranslations("auth");
  const errorMessage = useApiErrorMessage();
  const fieldErrors = useFieldErrors();
  const router = useRouter();

  const emailId = useId();
  const emailErrorId = useId();
  const passwordId = useId();
  const passwordErrorId = useId();
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function validate(): Record<string, string> {
    const next: Record<string, string> = {};
    if (!email) next.email = t("validation.emailRequired");
    else if (!EMAIL_RE.test(email)) next.email = t("validation.emailInvalid");
    if (!password) next.password = t("validation.passwordRequired");
    else if (password.length < MIN_PASSWORD)
      next.password = t("validation.passwordTooShort");
    return next;
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) {
      (found.email ? emailRef : found.password ? passwordRef : null)?.current?.focus();
      return;
    }

    setSubmitting(true);
    try {
      // Only Patients self-register; other roles are seeded (backend
      // rejects the rest with 403 unless PULSE_OPEN_ROLE_REGISTRATION is set).
      await api.post("/auth/register", { email, password, role: "PATIENT" });
      router.push(`/verify-pending?email=${encodeURIComponent(email)}`);
    } catch (err) {
      const fields = fieldErrors(err);
      if (Object.keys(fields).length > 0) setErrors(fields);
      setFormError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="animate-in fade-in-0 slide-in-from-bottom-1 mx-auto grid max-w-sm place-items-center py-6 duration-300 motion-reduce:animate-none sm:py-12">
      <Card className="w-full">
        <CardHeader className="text-center">
          {/* CardTitle renders a <div>; the accessible-heading role here matters
              (e2e selects by role), so this is a plain <h1> with matching type
              styles rather than <CardTitle>. */}
          <h1 className="text-2xl leading-snug font-semibold">{t("register.title")}</h1>
          <CardDescription>{t("register.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {formError && (
            <Alert variant="destructive">
              <TriangleAlertIcon />
              <AlertTitle>{formError}</AlertTitle>
            </Alert>
          )}

          <form onSubmit={onSubmit} noValidate className="space-y-4">
            <Field data-invalid={!!errors.email || undefined}>
              <FieldLabel htmlFor={emailId}>{t("fields.email")}</FieldLabel>
              <Input
                ref={emailRef}
                id={emailId}
                type="email"
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={!!errors.email}
                aria-describedby={errors.email ? emailErrorId : undefined}
              />
              {errors.email && <FieldError id={emailErrorId}>{errors.email}</FieldError>}
            </Field>

            <Field data-invalid={!!errors.password || undefined}>
              <FieldLabel htmlFor={passwordId}>{t("fields.password")}</FieldLabel>
              <Input
                ref={passwordRef}
                id={passwordId}
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={!!errors.password}
                aria-describedby={errors.password ? passwordErrorId : undefined}
              />
              {errors.password && <FieldError id={passwordErrorId}>{errors.password}</FieldError>}
            </Field>

            <Button type="submit" disabled={submitting} aria-busy={submitting} className="h-11 w-full">
              {submitting && <Spinner />}
              {t("register.submit")}
            </Button>
          </form>
        </CardContent>
        <CardFooter>
          <CardDescription>
            {t("register.haveAccount")}{" "}
            <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
              {t("register.signInLink")}
            </Link>
          </CardDescription>
        </CardFooter>
      </Card>
    </section>
  );
}
