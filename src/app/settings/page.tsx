"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Save, Trash2 } from "lucide-react";
import AccessDenied from "@/components/auth/AccessDenied";
import AppShell from "@/components/layout/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { isSuperUser } from "@/lib/permissions";
import { getBarContextForUser } from "@/services/dashboardService";
import {
  type CloseDaySettings,
  defaultCloseDaySettings,
  getCloseDaySettings,
  saveCloseDaySettings,
} from "@/services/settingsService";

export default function SettingsPage() {
  const { loading, user } = useAuth();
  const [barId, setBarId] = useState("");
  const [barName, setBarName] = useState("");
  const [role, setRole] = useState<string | null>(null);
  const [contextLoading, setContextLoading] = useState(true);
  const [settings, setSettings] = useState<CloseDaySettings>(
    defaultCloseDaySettings,
  );
  const [newExpenseOption, setNewExpenseOption] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (loading || !user) {
      return;
    }

    const loadSettings = async () => {
      const { barContext, error: contextError } = await getBarContextForUser(
        user.id,
        user.email,
      );

      if (!barContext) {
        setError(contextError);
        setContextLoading(false);
        return;
      }

      setBarId(barContext.barId);
      setBarName(barContext.barName);
      setRole(barContext.role);

      if (!isSuperUser(barContext.role)) {
        setContextLoading(false);
        return;
      }

      const { settings: closeDaySettings, error: settingsError } =
        await getCloseDaySettings(barContext.barId);

      if (settingsError) {
        setError(settingsError);
        setContextLoading(false);
        return;
      }

      setSettings(closeDaySettings);
      setContextLoading(false);
    };

    loadSettings();
  }, [loading, user]);

  async function handleSave() {
    setSaving(true);
    setError("");
    setMessage("");

    const { error: saveError } = await saveCloseDaySettings(
      barId,
      settings,
      role,
    );

    if (saveError) {
      setError(saveError);
      setSaving(false);
      return;
    }

    setMessage("Settings saved.");
    setSaving(false);
  }

  function toggleSetting(key: keyof Omit<CloseDaySettings, "expenseOptions">) {
    setSettings((current) => ({
      ...current,
      [key]: !current[key],
    }));
  }

  function addExpenseOption() {
    const option = newExpenseOption.trim();

    if (!option || settings.expenseOptions.includes(option)) {
      return;
    }

    setSettings((current) => ({
      ...current,
      expenseOptions: [...current.expenseOptions, option],
    }));
    setNewExpenseOption("");
  }

  if (loading || contextLoading) {
    return <p className="p-6">Loading settings...</p>;
  }

  if (!isSuperUser(role)) {
    return (
      <AppShell>
        <AccessDenied message="Settings are only available to super users." />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-5 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link
              href="/dashboard"
              className="mb-3 inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
            >
              <ArrowLeft size={16} />
              Dashboard
            </Link>
            <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
              Settings
            </h1>
            <p className="text-sm text-slate-500 sm:text-base">{barName}</p>
          </div>

          <button
            onClick={handleSave}
            disabled={saving || !barId}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-3 text-white hover:bg-slate-700 disabled:opacity-60 sm:py-2"
          >
            <Save size={18} />
            {saving ? "Saving..." : "Save"}
          </button>
        </div>

        {error && (
          <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {message && (
          <div className="rounded border border-green-200 bg-green-50 p-4 text-sm text-green-700">
            {message}
          </div>
        )}

        <section className="rounded-2xl border border-input-200 bg-background p-4 shadow-sm sm:p-6">
          <h2 className="mb-4 font-semibold">Close Day Fields</h2>
          <div className="space-y-3">
            <ToggleRow
              label="Product closure"
              description="Show product and stock-count fields in the close-day flow."
              checked={settings.showTopProduct}
              onChange={() => toggleSetting("showTopProduct")}
            />
            <ToggleRow
              label="Bills"
              description="Track unsettled staff-customer bills carried forward."
              checked={settings.showBills}
              onChange={() => toggleSetting("showBills")}
            />
            <ToggleRow
              label="Daily expenses"
              description="Track lunch, purchases, and other day expenses."
              checked={settings.showDailyExpenses}
              onChange={() => toggleSetting("showDailyExpenses")}
            />
            <ToggleRow
              label="Ledger photo"
              description="Require an image attachment for proof of the day's ledger."
              checked={settings.showLedgerPhoto}
              onChange={() => toggleSetting("showLedgerPhoto")}
            />
          </div>
        </section>

        <section className="rounded-2xl border border-input-200 bg-background p-4 shadow-sm sm:p-6">
          <h2 className="mb-4 font-semibold">Expense Options</h2>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row">
            <input
              value={newExpenseOption}
              onChange={(event) => setNewExpenseOption(event.target.value)}
              className="input"
              placeholder="Add expense option"
            />
            <button
              type="button"
              onClick={addExpenseOption}
              className="inline-flex items-center justify-center gap-2 rounded-lg border px-4 py-3 text-slate-700 hover:bg-slate-50 sm:py-2"
            >
              <Plus size={18} />
              Add
            </button>
          </div>

          <div className="space-y-2">
            {settings.expenseOptions.map((option) => (
              <div
                key={option}
                className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
              >
                <span className="break-words text-sm">{option}</span>
                <button
                  type="button"
                  onClick={() =>
                    setSettings((current) => ({
                      ...current,
                      expenseOptions: current.expenseOptions.filter(
                        (item) => item !== option,
                      ),
                    }))
                  }
                  className="shrink-0 rounded-md p-2 text-slate-500 hover:bg-slate-100"
                  aria-label={`Remove ${option}`}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border p-4">
      <span>
        <span className="block font-medium text-slate-900">{label}</span>
        <span className="block text-sm text-slate-500">{description}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="mt-1 h-5 w-5 shrink-0"
      />
    </label>
  );
}
