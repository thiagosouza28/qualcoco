declare module '@/components/ui/button' {
  import type { ComponentType } from 'react';
  export const Button: ComponentType<any>;
  export const buttonVariants: (...args: any[]) => string;
}

declare module '@/components/ui/card' {
  import type { ComponentType } from 'react';
  export const Card: ComponentType<any>;
  export const CardContent: ComponentType<any>;
  export const CardHeader: ComponentType<any>;
  export const CardTitle: ComponentType<any>;
}

declare module '@/components/ui/input' {
  import type { ComponentType } from 'react';
  export const Input: ComponentType<any>;
}

declare module '@/components/ui/textarea' {
  import type { ComponentType } from 'react';
  export const Textarea: ComponentType<any>;
}

declare module '@/components/ui/select' {
  import type { ComponentType } from 'react';
  export const Select: ComponentType<any>;
  export const SelectContent: ComponentType<any>;
  export const SelectItem: ComponentType<any>;
  export const SelectTrigger: ComponentType<any>;
  export const SelectValue: ComponentType<any>;
}

declare module '@/components/ui/dialog' {
  import type { ComponentType } from 'react';
  export const Dialog: ComponentType<any>;
  export const DialogContent: ComponentType<any>;
  export const DialogFooter: ComponentType<any>;
  export const DialogHeader: ComponentType<any>;
  export const DialogTitle: ComponentType<any>;
  export const DialogTrigger: ComponentType<any>;
}
