"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/* La portada lleva a "Hoy" (en exportación estática la redirección se hace en el navegador) */
export default function Home() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/hoy");
  }, [router]);
  return <Link href="/hoy">Ir a Hoy</Link>;
}
