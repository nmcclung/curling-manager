import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { api, type League, type Player } from "@/lib/api";

const playerFormSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required"),
    canPlaySkip: z.boolean(),
    canPlayVice: z.boolean(),
    canPlaySecond: z.boolean(),
    canPlayLead: z.boolean(),
    isNewCurler: z.boolean(),
    active: z.boolean(),
    notes: z.string().trim(),
  })
  .refine((data) => !data.active || data.canPlaySkip || data.canPlayVice || data.canPlaySecond || data.canPlayLead, {
    message: "An active player must be eligible for at least one position.",
    path: ["active"],
  });

type PlayerFormValues = z.infer<typeof playerFormSchema>;

const emptyValues: PlayerFormValues = {
  name: "",
  canPlaySkip: false,
  canPlayVice: false,
  canPlaySecond: false,
  canPlayLead: false,
  isNewCurler: false,
  active: true,
  notes: "",
};

function valuesFromPlayer(player: Player): PlayerFormValues {
  return {
    name: player.name,
    canPlaySkip: player.canPlaySkip,
    canPlayVice: player.canPlayVice,
    canPlaySecond: player.canPlaySecond,
    canPlayLead: player.canPlayLead,
    isNewCurler: player.isNewCurler,
    active: player.active,
    notes: player.notes ?? "",
  };
}

const POSITION_FIELDS = [
  { name: "canPlaySkip", label: "Skip" },
  { name: "canPlayVice", label: "Vice" },
  { name: "canPlaySecond", label: "Second" },
  { name: "canPlayLead", label: "Lead" },
] as const;

export function PlayerFormDialog({
  league,
  player,
  open,
  onOpenChange,
  onSaved,
}: {
  league: League;
  player?: Player;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const form = useForm<PlayerFormValues>({
    resolver: zodResolver(playerFormSchema),
    defaultValues: emptyValues,
  });

  useEffect(() => {
    if (open) {
      form.reset(player ? valuesFromPlayer(player) : emptyValues);
      setSubmitError(null);
    }
  }, [open, player, form]);

  const onSubmit = async (values: PlayerFormValues) => {
    setSubmitError(null);
    try {
      const payload = { ...values, notes: values.notes || null, leagueId: league.id };
      if (player) {
        await api.updatePlayer(player.id, payload);
      } else {
        await api.createPlayer(payload);
      }
      onSaved();
      onOpenChange(false);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{player ? "Edit Player" : "Add Player"}</DialogTitle>
          <DialogDescription>{league.name} league</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input {...field} autoFocus />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div>
              <FormLabel className="mb-2 block">Position eligibility</FormLabel>
              <div className="grid grid-cols-2 gap-2">
                {POSITION_FIELDS.map(({ name, label }) => (
                  <FormField
                    key={name}
                    control={form.control}
                    name={name}
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center gap-2">
                        <FormControl>
                          <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                        <FormLabel className="font-normal">{label}</FormLabel>
                      </FormItem>
                    )}
                  />
                ))}
              </div>
            </div>

            <div className="flex items-center gap-6">
              <FormField
                control={form.control}
                name="isNewCurler"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center gap-2">
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <FormLabel className="font-normal">New curler</FormLabel>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="active"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center gap-2">
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <FormLabel className="font-normal">Active</FormLabel>
                  </FormItem>
                )}
              />
            </div>
            {form.formState.errors.active && (
              <p className="text-sm text-destructive">{form.formState.errors.active.message}</p>
            )}

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Optional" />
                  </FormControl>
                </FormItem>
              )}
            />

            {submitError && <p className="text-sm text-destructive">{submitError}</p>}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {player ? "Save changes" : "Add player"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
