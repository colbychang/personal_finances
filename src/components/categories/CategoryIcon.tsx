"use client";

import {
  Home,
  ShoppingCart,
  Utensils,
  Wine,
  Smile,
  Shirt,
  Shield,
  Repeat,
  Lamp,
  Plane,
  CreditCard,
  Tag,
  PawPrint,
  type LucideIcon,
} from "lucide-react";

const ICON_MAP: Record<string, LucideIcon> = {
  home: Home,
  "shopping-cart": ShoppingCart,
  utensils: Utensils,
  wine: Wine,
  smile: Smile,
  shirt: Shirt,
  shield: Shield,
  repeat: Repeat,
  lamp: Lamp,
  plane: Plane,
  "credit-card": CreditCard,
  tag: Tag,
  "paw-print": PawPrint,
};

interface CategoryIconProps {
  icon: string | null;
  className?: string;
}

export function CategoryIcon({ icon, className = "h-4 w-4" }: CategoryIconProps) {
  const IconComponent = ICON_MAP[icon ?? "tag"] ?? Tag;
  return <IconComponent className={className} />;
}
