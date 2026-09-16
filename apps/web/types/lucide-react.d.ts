declare module "lucide-react" {
  import type {
    ForwardRefExoticComponent,
    RefAttributes,
    SVGProps,
  } from "react";

  export type LucideProps = SVGProps<SVGSVGElement> & {
    readonly absoluteStrokeWidth?: boolean;
    readonly size?: number | string;
    readonly strokeWidth?: number | string;
  };

  export type LucideIcon = ForwardRefExoticComponent<
    Omit<LucideProps, "ref"> & RefAttributes<SVGSVGElement>
  >;

  export const Anchor: LucideIcon;
  export const Eraser: LucideIcon;
  export const ArrowDownRight: LucideIcon;
  export const ArrowUpRight: LucideIcon;
  export const BarChart3: LucideIcon;
  export const Eye: LucideIcon;
  export const EyeOff: LucideIcon;
  export const History: LucideIcon;
  export const Info: LucideIcon;
  export const MousePointer2: LucideIcon;
  export const PanelLeftClose: LucideIcon;
  export const PanelLeftOpen: LucideIcon;
  export const Pause: LucideIcon;
  export const Play: LucideIcon;
  export const RotateCcw: LucideIcon;
  export const SeparatorHorizontal: LucideIcon;
  export const SeparatorVertical: LucideIcon;
  export const Settings2: LucideIcon;
  export const StepForward: LucideIcon;
  export const Trash2: LucideIcon;
}
