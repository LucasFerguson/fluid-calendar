import { ReactNode } from "react";

import { Card, CardContent } from "@/components/ui/card";

interface Props {
  label: string;
  value: ReactNode;
  sublabel?: string;
  accent?: boolean;
}

export function StatTile({ label, value, sublabel, accent }: Props) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div
          className={
            "mt-1 text-3xl font-semibold " + (accent ? "text-primary" : "")
          }
        >
          {value}
        </div>
        {sublabel && (
          <div className="mt-0.5 text-xs text-muted-foreground">{sublabel}</div>
        )}
      </CardContent>
    </Card>
  );
}
