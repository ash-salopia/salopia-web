import { Suspense } from "react";
import StoreThanks from "@/components/store/StoreThanks";

export const dynamic = "force-dynamic";

export default function StoreThanksPage() {
  return (
    <Suspense fallback={null}>
      <StoreThanks />
    </Suspense>
  );
}
