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

  export const Eraser: LucideIcon;
  export const Eye: LucideIcon;
  export const EyeOff: LucideIcon;
  export const Info: LucideIcon;
  export const MousePointer2: LucideIcon;
  export const PanelLeftClose: LucideIcon;
  export const PanelLeftOpen: LucideIcon;
  export const SeparatorHorizontal: LucideIcon;
  export const SeparatorVertical: LucideIcon;
  export const Settings2: LucideIcon;
  export const Trash2: LucideIcon;
}
