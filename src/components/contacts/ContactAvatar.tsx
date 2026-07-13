"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

import { cn } from "@/lib/utils";

import { initials } from "./format";

interface Props {
  name: string | null;
  email: string;
  photoUrl: string | null;
  className?: string;
}

// Photo from the CRM profile when present, initials otherwise (Radix falls
// back to initials automatically if the image fails to load).
export function ContactAvatar({ name, email, photoUrl, className }: Props) {
  return (
    <Avatar className={cn("h-8 w-8 shrink-0", className)}>
      {photoUrl && <AvatarImage src={photoUrl} alt={name || email} />}
      <AvatarFallback className="bg-primary/10 text-xs font-medium text-primary">
        {initials(name, email)}
      </AvatarFallback>
    </Avatar>
  );
}
