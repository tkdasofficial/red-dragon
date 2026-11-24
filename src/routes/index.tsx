import { createFileRoute } from "@tanstack/react-router";
import DragonScene from "@/components/DragonScene";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Pyro Rex — Voxel Pixel Dragon" },
      { name: "description", content: "A blocky pixel-art 3D dragon you can rotate, walk, and make breathe fire." },
      { property: "og:title", content: "Pyro Rex — Voxel Pixel Dragon" },
      { property: "og:description", content: "Rotate a blocky pixel dragon, watch it walk, and unleash a fire attack." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DragonScene,
});
