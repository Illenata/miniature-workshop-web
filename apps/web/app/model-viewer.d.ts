import type { DetailedHTMLProps, HTMLAttributes } from "react";

// <model-viewer> attributes used by the site (https://modelviewer.dev/docs).
type ModelViewerAttributes = DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
  src?: string;
  poster?: string;
  alt?: string;
  loading?: "auto" | "lazy" | "eager";
  reveal?: "auto" | "manual";
  "auto-rotate"?: boolean;
  "auto-rotate-delay"?: number | string;
  "rotation-per-second"?: string;
  "camera-controls"?: boolean;
  "camera-orbit"?: string;
  "interaction-prompt"?: "auto" | "none";
  "environment-image"?: string;
  "shadow-intensity"?: number | string;
  "shadow-softness"?: number | string;
  exposure?: number | string;
  "min-camera-orbit"?: string;
  "max-camera-orbit"?: string;
  "touch-action"?: "pan-y" | "pan-x" | "none";
  ar?: boolean;
  "ar-modes"?: string;
  "ar-scale"?: "auto" | "fixed";
  "ar-placement"?: "floor" | "wall";
};

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": ModelViewerAttributes;
    }
  }
}
