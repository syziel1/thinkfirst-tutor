import { randomInt } from "node:crypto";

import { TutorDemo } from "@/components/tutor-demo";
import { MAX_DEMO_PROBLEM_SEED } from "@/lib/tutor/problems";

export const dynamic = "force-dynamic";

export default function Home() {
  const initialProblemSeed = randomInt(MAX_DEMO_PROBLEM_SEED + 1);

  return <TutorDemo initialProblemSeed={initialProblemSeed} />;
}
