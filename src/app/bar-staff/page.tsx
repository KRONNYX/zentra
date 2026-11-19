"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Ban,
  CalendarPlus,
  KeyRound,
  Save,
  ShieldCheck,
  Trash2,
  UserPlus,
} from "lucide-react";
import AccessDenied from "@/components/auth/AccessDenied";
import AppShell from "@/components/layout/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { hasPermission } from "@/lib/permissions";
import {
  createShift,
  createStaffMember,
  deleteShift,
  deleteStaffMember,
  disableStaffMember,
  getBarStaff,
  staffPermissionOptions,
  type BarProfile,
  type Shift,
  type ShiftForm,
  type StaffForm,
  type StaffMember,
  type StaffPermission,
  updateBarProfile,
  updateStaffMember,
} from "@/services/barStaffService";
import { getBarContextForUser } from "@/services/dashboardService";
import { DEFAULT_BUSINESS_DAY_CUTOFF } from "@/lib/businessDate";
import {
  inviteBarUser,
  listBarMemberships,
  removeBarMembership,
  updateMembershipRole,
  type BarMembership,
  type BarMembershipRole,
  type InviteBarUserInput,
} from "@/services/membershipService";

const emptyStaff: StaffForm = {
  name: "",
  email: "",
  staffCode: "",
  role: "Staff",
  phone: "",
  isActive: true,
  permissions: ["close_day"],
};

const emptyBarProfile: BarProfile = {
  name: "",
  address: "",
  phone: "",
  email: "",
  imageUrl: "",
  businessDayCutoff: DEFAULT_BUSINESS_DAY_CUTOFF,
};

const emptyShift: ShiftForm = {
  staffId: "",
  staffName: "",
  role: "",
  startsAt: "",
  endsAt: "",
  notes: "",
};

const emptyInvite: InviteBarUserInput = {
  barId: "",
  email: "",
  fullName: "",
  role: "staff",
  linkStaffRecord: true,
  jobTitle: "",
};

export default function BarStaffPage() {
  const { loading, user } = useAuth();
  const [barId, setBarId] = useState("");
  const [role, setRole] = useState<string | null>(null);
  const [barProfile, setBarProfile] = useState<BarProfile>(emptyBarProfile);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [memberships, setMemberships] = useState<BarMembership[]>([]);
  const [newStaff, setNewStaff] = useState<StaffForm>(emptyStaff);
  const [newShift, setNewShift] = useState<ShiftForm>(emptyShift);
  const [invite, setInvite] = useState<InviteBarUserInput>(emptyInvite);
  const [savingBar, setSavingBar] = useState(false);
  const [savingId, setSavingId] = useState("");
  const [creating, setCreating] = useState(false);
  const [creatingShift, setCreatingShift] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const canManageStaff = hasPermission(role, "manage_staff");

  const activeStaff = useMemo(
    () => staff.filter((member) => member.isActive),
    [staff],
  );

  async function loadStaff(nextBarId: string) {
    const {
      barProfile: nextProfile,
      staff: nextStaff,
      shifts: nextShifts,
      error: staffError,
    } = await getBarStaff(nextBarId);
    const { memberships: nextMemberships, error: membershipsError } =
      await listBarMemberships(nextBarId);

    if (staffError || membershipsError) {
      setError(staffError || membershipsError);
      return;
    }

    setBarProfile(nextProfile);
    setStaff(nextStaff);
    setShifts(nextShifts);
    setMemberships(nextMemberships);
  }

  useEffect(() => {
    if (loading || !user) {
      return;
    }

    const loadPage = async () => {
      const { barContext, error: contextError } = await getBarContextForUser(
        user.id,
        user.email,
      );

      if (!barContext) {
        setError(contextError);
        setDataLoading(false);
        return;
      }

      setBarId(barContext.barId);
      setRole(barContext.role);
      setInvite((current) => ({ ...current, barId: barContext.barId }));
      await loadStaff(barContext.barId);
      setDataLoading(false);
    };

    loadPage();
  }, [loading, user]);

  function updateLocalStaff(staffId: string, changes: Partial<StaffForm>) {
    setStaff((current) =>
      current.map((member) =>
        member.id === staffId ? { ...member, ...changes } : member,
      ),
    );
  }

  async function handleSaveBar() {
    if (!canManageStaff) {
      setError("Only owners and super users can edit the bar profile.");
      return;
    }

    setSavingBar(true);
    setError("");
    setMessage("");

    const { error: saveError } = await updateBarProfile(barId, barProfile, role);

    if (saveError) {
      setError(saveError);
      setSavingBar(false);
      return;
    }

    setMessage("Bar profile saved.");
    setSavingBar(false);
  }

  async function handleCreate() {
    if (!canManageStaff) {
      setError("Only owners and super users can add staff.");
      return;
    }

    setCreating(true);
    setError("");
    setMessage("");

    const { error: createError } = await createStaffMember(barId, newStaff, role);

    if (createError) {
      setError(createError);
      setCreating(false);
      return;
    }

    setNewStaff(emptyStaff);
    setMessage("Staff member added.");
    await loadStaff(barId);
    setCreating(false);
  }

  async function handleSaveStaff(member: StaffMember) {
    if (!canManageStaff) {
      setError("Managers can view staff, but cannot edit staff records.");
      return;
    }

    setSavingId(member.id);
    setError("");
    setMessage("");

    const { error: saveError } = await updateStaffMember(
      barId,
      member.id,
      member,
      role,
    );

    if (saveError) {
      setError(saveError);
      setSavingId("");
      return;
    }

    setMessage("Staff member saved.");
    await loadStaff(barId);
    setSavingId("");
  }

  async function handleDisableStaff(member: StaffMember) {
    if (!canManageStaff) {
      setError("Only owners and super users can enable or disable staff.");
      return;
    }

    setSavingId(member.id);
    setError("");
    setMessage("");

    const { error: disableError } = await disableStaffMember(
      barId,
      member.id,
      member.isActive,
      role,
    );

    if (disableError) {
      setError(disableError);
      setSavingId("");
      return;
    }

    setMessage(member.isActive ? "Staff member disabled." : "Staff member enabled.");
    await loadStaff(barId);
    setSavingId("");
  }

  async function handleDeleteStaff(staffId: string) {
    if (!canManageStaff) {
      setError("Only owners and super users can remove staff.");
      return;
    }

    setSavingId(staffId);
    setError("");
    setMessage("");

    const { error: deleteError } = await deleteStaffMember(barId, staffId, role);

    if (deleteError) {
      setError(deleteError);
      setSavingId("");
      return;
    }

    setMessage("Staff member removed.");
    await loadStaff(barId);
    setSavingId("");
  }

  async function handleCreateShift() {
    if (!canManageStaff) {
      setError("Only owners and super users can add shifts.");
      return;
    }

    setCreatingShift(true);
    setError("");
    setMessage("");

    const { error: shiftError } = await createShift(barId, newShift, role);

    if (shiftError) {
      setError(shiftError);
      setCreatingShift(false);
      return;
    }

    setNewShift(emptyShift);
    setMessage("Shift added.");
    await loadStaff(barId);
    setCreatingShift(false);
  }

  async function handleDeleteShift(shiftId: string) {
    if (!canManageStaff) {
      setError("Only owners and super users can remove shifts.");
      return;
    }

    setSavingId(shiftId);
    setError("");
    setMessage("");

    const { error: deleteError } = await deleteShift(barId, shiftId, role);

    if (deleteError) {
      setError(deleteError);
      setSavingId("");
      return;
    }

    setMessage("Shift removed.");
    await loadStaff(barId);
    setSavingId("");
  }

  function handlePasswordReset(member: StaffMember) {
    if (!canManageStaff) {
      setError("Only owners and super users can reset staff passwords.");
      return;
    }

    setMessage(
      member.email
        ? `Password reset for ${member.email} needs the auth invite/reset flow to be enabled.`
        : "Add an email address before password reset can be enabled.",
    );
  }

  async function handleInviteUser() {
    if (!canManageStaff) {
      setError("Only owners and super users can invite login users.");
      return;
    }

    setInviting(true);
    setError("");
    setMessage("");

    const result = await inviteBarUser({ ...invite, barId });

    if (result.error) {
      setError(result.error);
      setInviting(false);
      return;
    }

    setInvite({ ...emptyInvite, barId });
    setMessage(result.message ?? "Invite sent.");
    await loadStaff(barId);
    setInviting(false);
  }

  async function handleMembershipRoleChange(
    userId: string,
    nextRole: BarMembershipRole,
  ) {
    if (!canManageStaff) {
      setError("Only owners and super users can update login access.");
      return;
    }

    setSavingId(userId);
    setError("");
    setMessage("");

    const result = await updateMembershipRole(barId, userId, nextRole);

    if (result.error) {
      setError(result.error);
      setSavingId("");
      return;
    }

    setMessage(result.message ?? "Access role updated.");
    await loadStaff(barId);
    setSavingId("");
  }

  async function handleRemoveMembership(userId: string) {
    if (!canManageStaff) {
      setError("Only owners and super users can remove login access.");
      return;
    }

    setSavingId(userId);
    setError("");
    setMessage("");

    const result = await removeBarMembership(barId, userId);

    if (result.error) {
      setError(result.error);
      setSavingId("");
      return;
    }

    setMessage(result.message ?? "Login access removed.");
    await loadStaff(barId);
    setSavingId("");
  }

  if (loading || dataLoading) {
    return (
      <AppShell>
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="h-40 animate-pulse rounded-2xl bg-white" />
        </div>
      </AppShell>
    );
  }

  if (!hasPermission(role, "view_staff")) {
    return (
      <AppShell>
        <AccessDenied message="Your permissions are not configured for Staff yet." />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Link
              href="/dashboard"
              className="mb-3 inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
            >
              <ArrowLeft size={16} />
              Home
            </Link>
            <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
              Bar & Staff
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-500">
              Manage the bar profile, staff access, permissions and shift coverage.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 rounded-2xl border border-slate-200 bg-white p-3 text-center shadow-sm">
            <Metric label="Staff" value={`${staff.length}`} />
            <Metric label="Active" value={`${activeStaff.length}`} />
            <Metric label="Shifts" value={`${shifts.length}`} />
          </div>
        </header>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">
            {error}
          </div>
        )}

        {message && (
          <div className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm font-medium text-green-700">
            {message}
          </div>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-bold text-slate-950">Bar Profile</h2>
              <p className="text-sm text-slate-500">
                Owner-facing business information.
              </p>
            </div>
            <button
              type="button"
              onClick={handleSaveBar}
              disabled={savingBar || !barId || !canManageStaff}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              <Save size={18} />
              {savingBar ? "Saving..." : "Save"}
            </button>
          </div>

          <div className="grid gap-4 lg:grid-cols-[160px_1fr]">
            <div className="flex aspect-square items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
              {barProfile.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={barProfile.imageUrl}
                  alt={barProfile.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="px-4 text-center text-sm font-semibold text-slate-400">
                  Bar image
                </span>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Bar name">
                <input
                  value={barProfile.name}
                  readOnly={!canManageStaff}
                  onChange={(event) =>
                    setBarProfile((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  className={canManageStaff ? "input" : "input bg-slate-50"}
                  placeholder="Bar name"
                />
              </Field>
              <Field label="Phone">
                <input
                  value={barProfile.phone}
                  readOnly={!canManageStaff}
                  onChange={(event) =>
                    setBarProfile((current) => ({
                      ...current,
                      phone: event.target.value,
                    }))
                  }
                  className={canManageStaff ? "input" : "input bg-slate-50"}
                  placeholder="+254..."
                />
              </Field>
              <Field label="Email">
                <input
                  value={barProfile.email}
                  readOnly={!canManageStaff}
                  onChange={(event) =>
                    setBarProfile((current) => ({
                      ...current,
                      email: event.target.value,
                    }))
                  }
                  className={canManageStaff ? "input" : "input bg-slate-50"}
                  placeholder="owner@example.com"
                />
              </Field>
              <Field label="Image URL">
                <input
                  value={barProfile.imageUrl}
                  readOnly={!canManageStaff}
                  onChange={(event) =>
                    setBarProfile((current) => ({
                      ...current,
                      imageUrl: event.target.value,
                    }))
                  }
                  className={canManageStaff ? "input" : "input bg-slate-50"}
                  placeholder="https://..."
                />
              </Field>
              <Field label="Business day ends at">
                <input
                  type="time"
                  max="12:00"
                  value={barProfile.businessDayCutoff}
                  readOnly={!canManageStaff}
                  onChange={(event) =>
                    setBarProfile((current) => ({
                      ...current,
                      businessDayCutoff: event.target.value,
                    }))
                  }
                  className={canManageStaff ? "input" : "input bg-slate-50"}
                />
                <span className="mt-1 block text-xs text-slate-500">
                  Sales before this time count towards the previous night&apos;s shift.
                </span>
              </Field>
              <div className="sm:col-span-2">
                <Field label="Address">
                  <textarea
                    value={barProfile.address}
                    readOnly={!canManageStaff}
                    onChange={(event) =>
                      setBarProfile((current) => ({
                        ...current,
                        address: event.target.value,
                      }))
                    }
                    className={`${canManageStaff ? "input" : "input bg-slate-50"} min-h-24 resize-none`}
                    placeholder="Street, town, landmark"
                  />
                </Field>
              </div>
            </div>
          </div>
        </section>

        {!canManageStaff && (
          <section className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm font-medium text-blue-800 shadow-sm">
            Managers can view staff, shifts and permissions. Staff changes,
            password resets and removals are restricted to owners and super users.
          </section>
        )}

        {canManageStaff && (
        <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-bold text-slate-950">Add Staff</h2>
            <p className="mt-1 text-sm text-slate-500">
              Add staff used in Close Day bill attribution.
            </p>
            <div className="mt-4 space-y-3">
              <StaffEditor
                staff={newStaff}
                onChange={(changes) =>
                  setNewStaff((current) => ({ ...current, ...changes }))
                }
              />
              <button
                type="button"
                onClick={handleCreate}
                disabled={creating || !barId}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                <UserPlus size={18} />
                {creating ? "Adding..." : "Add Staff"}
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-bold text-slate-950">Add Shift</h2>
            <p className="mt-1 text-sm text-slate-500">
              Track who is responsible during a trading window.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="Staff">
                <select
                  value={newShift.staffId}
                  onChange={(event) => {
                    const member = staff.find(
                      (item) => item.id === event.target.value,
                    );
                    setNewShift((current) => ({
                      ...current,
                      staffId: member?.id ?? "",
                      staffName: member?.name ?? "",
                      role: member?.role ?? current.role,
                    }));
                  }}
                  className="input"
                >
                  <option value="">Choose staff</option>
                  {activeStaff.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Role">
                <input
                  value={newShift.role}
                  onChange={(event) =>
                    setNewShift((current) => ({
                      ...current,
                      role: event.target.value,
                    }))
                  }
                  className="input"
                  placeholder="Bartender"
                />
              </Field>
              <Field label="Starts">
                <input
                  type="datetime-local"
                  value={newShift.startsAt}
                  onChange={(event) =>
                    setNewShift((current) => ({
                      ...current,
                      startsAt: event.target.value,
                    }))
                  }
                  className="input"
                />
              </Field>
              <Field label="Ends">
                <input
                  type="datetime-local"
                  value={newShift.endsAt}
                  onChange={(event) =>
                    setNewShift((current) => ({
                      ...current,
                      endsAt: event.target.value,
                    }))
                  }
                  className="input"
                />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Notes">
                  <input
                    value={newShift.notes}
                    onChange={(event) =>
                      setNewShift((current) => ({
                        ...current,
                        notes: event.target.value,
                      }))
                    }
                    className="input"
                    placeholder="Opening, closing, stock count..."
                  />
                </Field>
              </div>
              <button
                type="button"
                onClick={handleCreateShift}
                disabled={creatingShift || !barId}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-60 sm:col-span-2"
              >
                <CalendarPlus size={18} />
                {creatingShift ? "Adding..." : "Add Shift"}
              </button>
            </div>
          </div>
        </section>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-bold text-slate-950">Login Users</h2>
              <p className="text-sm text-slate-500">
                People who can sign into Zentra for this bar.
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
              {memberships.length} users
            </span>
          </div>

          {canManageStaff && (
            <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-sm font-bold text-slate-950">Invite User</h3>
              <div className="mt-3 grid gap-3 lg:grid-cols-5">
                <Field label="Email">
                  <input
                    type="email"
                    value={invite.email}
                    onChange={(event) =>
                      setInvite((current) => ({
                        ...current,
                        email: event.target.value,
                      }))
                    }
                    className="input"
                    placeholder="person@example.com"
                  />
                </Field>
                <Field label="Full name">
                  <input
                    value={invite.fullName}
                    onChange={(event) =>
                      setInvite((current) => ({
                        ...current,
                        fullName: event.target.value,
                      }))
                    }
                    className="input"
                    placeholder="Optional"
                  />
                </Field>
                <Field label="Access role">
                  <select
                    value={invite.role}
                    onChange={(event) =>
                      setInvite((current) => ({
                        ...current,
                        role: event.target.value as BarMembershipRole,
                      }))
                    }
                    className="input"
                  >
                    <option value="owner">Owner</option>
                    <option value="manager">Manager</option>
                    <option value="staff">Staff</option>
                  </select>
                </Field>
                <Field label="Job title">
                  <input
                    value={invite.jobTitle}
                    onChange={(event) =>
                      setInvite((current) => ({
                        ...current,
                        jobTitle: event.target.value,
                      }))
                    }
                    className="input"
                    placeholder="Bartender"
                  />
                </Field>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={handleInviteUser}
                    disabled={inviting || !barId}
                    className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60"
                  >
                    <UserPlus size={18} />
                    {inviting ? "Inviting..." : "Invite"}
                  </button>
                </div>
                <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-3 lg:col-span-5">
                  <input
                    type="checkbox"
                    checked={invite.linkStaffRecord}
                    onChange={(event) =>
                      setInvite((current) => ({
                        ...current,
                        linkStaffRecord: event.target.checked,
                      }))
                    }
                    className="h-4 w-4"
                  />
                  <span className="text-sm font-semibold text-slate-700">
                    Create or update matching staff directory record
                  </span>
                </label>
              </div>
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Access Role</th>
                  <th className="px-4 py-3">Linked Staff</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {memberships.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                      No login users linked to this bar yet.
                    </td>
                  </tr>
                ) : (
                  memberships.map((membership) => (
                    <tr
                      key={membership.userId}
                      className="border-t border-slate-200 align-middle"
                    >
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-950">
                          {membership.email || "Email unavailable"}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Added {formatDateTime(membership.createdAt)}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        {canManageStaff ? (
                          <select
                            value={membership.role}
                            onChange={(event) =>
                              handleMembershipRoleChange(
                                membership.userId,
                                event.target.value as BarMembershipRole,
                              )
                            }
                            disabled={savingId === membership.userId}
                            className="input max-w-36 capitalize"
                          >
                            <option value="owner">Owner</option>
                            <option value="manager">Manager</option>
                            <option value="staff">Staff</option>
                          </select>
                        ) : (
                          <span className="capitalize">{membership.role}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {membership.staffName ? (
                          <span className="font-semibold text-slate-700">
                            {membership.staffName}
                          </span>
                        ) : (
                          <span className="text-slate-400">Not linked</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
                          {membership.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {canManageStaff ? (
                          <button
                            type="button"
                            onClick={() =>
                              handleRemoveMembership(membership.userId)
                            }
                            disabled={savingId === membership.userId}
                            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-red-200 px-3 text-sm font-bold text-red-600 hover:bg-red-50 disabled:opacity-60"
                          >
                            <Trash2 size={16} />
                            Remove
                          </button>
                        ) : (
                          <span className="text-xs font-semibold text-slate-400">
                            Read only
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-bold text-slate-950">Staff Directory</h2>
              <p className="text-sm text-slate-500">
                Operational staff records used for shifts and close-day bill attribution.
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
              {staff.length} people
            </span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Staff</th>
                  <th className="px-4 py-3">Contact</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Permissions</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {staff.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                      No staff added yet.
                    </td>
                  </tr>
                ) : (
                  staff.map((member) => (
                    <tr key={member.id} className="border-t border-slate-200 align-top">
                      <td className="px-4 py-3">
                        <div className="space-y-2">
                          <input
                            value={member.name}
                            readOnly={!canManageStaff}
                            onChange={(event) =>
                              updateLocalStaff(member.id, {
                                name: event.target.value,
                              })
                            }
                            className={canManageStaff ? "input" : "input bg-slate-50"}
                          />
                          <input
                            value={member.staffCode}
                            readOnly={!canManageStaff}
                            onChange={(event) =>
                              updateLocalStaff(member.id, {
                                staffCode: event.target.value,
                              })
                            }
                            className={canManageStaff ? "input" : "input bg-slate-50"}
                            placeholder="Staff ID / code"
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="space-y-2">
                          <input
                            value={member.email}
                            readOnly={!canManageStaff}
                            onChange={(event) =>
                              updateLocalStaff(member.id, {
                                email: event.target.value,
                              })
                            }
                            className={canManageStaff ? "input" : "input bg-slate-50"}
                            placeholder="Email"
                          />
                          <input
                            value={member.phone}
                            readOnly={!canManageStaff}
                            onChange={(event) =>
                              updateLocalStaff(member.id, {
                                phone: event.target.value,
                              })
                            }
                            className={canManageStaff ? "input" : "input bg-slate-50"}
                            placeholder="Phone"
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <input
                          value={member.role}
                          readOnly={!canManageStaff}
                          onChange={(event) =>
                            updateLocalStaff(member.id, {
                              role: event.target.value,
                            })
                          }
                          className={canManageStaff ? "input" : "input bg-slate-50"}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <PermissionPicker
                          value={member.permissions}
                          disabled={!canManageStaff}
                          onChange={(permissions) =>
                            updateLocalStaff(member.id, { permissions })
                          }
                        />
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() =>
                            updateLocalStaff(member.id, {
                              isActive: !member.isActive,
                            })
                          }
                          disabled={!canManageStaff}
                          className={`rounded-full px-3 py-1 text-xs font-bold ${
                            member.isActive
                              ? "bg-green-50 text-green-700"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {member.isActive ? "Active" : "Disabled"}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        {canManageStaff ? (
                        <div className="flex justify-end gap-2">
                          <IconAction
                            label="Save staff"
                            onClick={() => handleSaveStaff(member)}
                            disabled={savingId === member.id}
                            icon={<Save size={16} />}
                          />
                          <IconAction
                            label={member.isActive ? "Disable staff" : "Enable staff"}
                            onClick={() => handleDisableStaff(member)}
                            disabled={savingId === member.id}
                            icon={<Ban size={16} />}
                          />
                          <IconAction
                            label="Reset password"
                            onClick={() => handlePasswordReset(member)}
                            icon={<KeyRound size={16} />}
                          />
                          <IconAction
                            label="Remove staff"
                            onClick={() => handleDeleteStaff(member.id)}
                            disabled={savingId === member.id}
                            danger
                            icon={<Trash2 size={16} />}
                          />
                        </div>
                        ) : (
                          <p className="text-right text-xs font-semibold text-slate-400">
                            Read only
                          </p>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h2 className="font-bold text-slate-950">Recent Shifts</h2>
            <p className="text-sm text-slate-500">
              Latest shift records for this bar.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {shifts.length === 0 ? (
              <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
                No shifts recorded yet.
              </p>
            ) : (
              shifts.map((shift) => (
                <article key={shift.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-bold text-slate-950">
                        {shift.staffName}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        {shift.role || "Shift"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteShift(shift.id)}
                      disabled={!canManageStaff}
                      className="rounded-lg p-2 text-red-600 hover:bg-red-50"
                      aria-label="Remove shift"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <p className="mt-3 text-xs text-slate-500">
                    {formatDateTime(shift.startsAt)} to {formatDateTime(shift.endsAt)}
                  </p>
                  {shift.notes && (
                    <p className="mt-2 text-sm text-slate-600">{shift.notes}</p>
                  )}
                </article>
              ))
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-20">
      <p className="text-lg font-black text-slate-950">{value}</p>
      <p className="text-xs font-semibold text-slate-500">{label}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}

function StaffEditor({
  staff,
  onChange,
}: {
  staff: StaffForm;
  onChange: (staff: Partial<StaffForm>) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Name">
        <input
          value={staff.name}
          onChange={(event) => onChange({ name: event.target.value })}
          className="input"
          placeholder="Staff name"
        />
      </Field>
      <Field label="Staff ID">
        <input
          value={staff.staffCode}
          onChange={(event) => onChange({ staffCode: event.target.value })}
          className="input"
          placeholder="Code"
        />
      </Field>
      <Field label="Email">
        <input
          value={staff.email}
          onChange={(event) => onChange({ email: event.target.value })}
          className="input"
          placeholder="staff@example.com"
        />
      </Field>
      <Field label="Phone">
        <input
          value={staff.phone}
          onChange={(event) => onChange({ phone: event.target.value })}
          className="input"
          placeholder="+254..."
        />
      </Field>
      <Field label="Role">
        <input
          value={staff.role}
          onChange={(event) => onChange({ role: event.target.value })}
          className="input"
          placeholder="Manager"
        />
      </Field>
      <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-3">
        <input
          type="checkbox"
          checked={staff.isActive}
          onChange={(event) => onChange({ isActive: event.target.checked })}
          className="h-4 w-4"
        />
        <span className="text-sm font-semibold text-slate-700">Active</span>
      </label>
      <div className="sm:col-span-2">
        <PermissionPicker value={staff.permissions} onChange={onChangePermissions(onChange)} />
      </div>
    </div>
  );
}

function onChangePermissions(onChange: (staff: Partial<StaffForm>) => void) {
  return (permissions: StaffPermission[]) => onChange({ permissions });
}

function PermissionPicker({
  value,
  disabled = false,
  onChange,
}: {
  value: StaffPermission[];
  disabled?: boolean;
  onChange: (permissions: StaffPermission[]) => void;
}) {
  function toggle(permission: StaffPermission) {
    if (disabled) {
      return;
    }

    const next = value.includes(permission)
      ? value.filter((item) => item !== permission)
      : [...value, permission];
    onChange(next);
  }

  return (
    <div className="flex flex-wrap gap-2">
      {staffPermissionOptions.map((permission) => (
        <button
          key={permission}
          type="button"
          disabled={disabled}
          onClick={() => toggle(permission)}
          className={`inline-flex min-h-9 items-center gap-1 rounded-full border px-3 text-xs font-bold capitalize disabled:cursor-not-allowed disabled:opacity-60 ${
            value.includes(permission)
              ? "border-blue-200 bg-blue-50 text-blue-700"
              : "border-slate-200 text-slate-600 hover:bg-slate-50"
          }`}
        >
          <ShieldCheck size={14} />
          {permission.replace("_", " ")}
        </button>
      ))}
    </div>
  );
}

function IconAction({
  label,
  icon,
  danger = false,
  disabled = false,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border transition disabled:opacity-50 ${
        danger
          ? "border-red-200 text-red-600 hover:bg-red-50"
          : "border-slate-200 text-slate-600 hover:bg-slate-50"
      }`}
    >
      {icon}
    </button>
  );
}

function formatDateTime(value: string) {
  if (!value) {
    return "Not set";
  }

  return new Date(value).toLocaleString("en-KE", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
