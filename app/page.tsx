import { ToluvaApp } from "./toluva-app";
import { liveIntakeEnabled } from "../lib/runtime-mode";

export default function Home() {
  return <ToluvaApp liveIntakeEnabled={liveIntakeEnabled()} />;
}
