import { Suspense } from "react";
import AuthForm from "./auth-form";

async function Form({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const { mode } = await searchParams;
  return <AuthForm initialMode={mode === "signup" ? "signup" : "login"} />;
}

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main className="mx-auto w-full max-w-sm px-4 py-10">
      <h1 className="text-2xl font-bold">Easy Apartment</h1>
      <Suspense fallback={<p className="mt-6 text-muted">กำลังโหลด…</p>}>
        <Form searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
