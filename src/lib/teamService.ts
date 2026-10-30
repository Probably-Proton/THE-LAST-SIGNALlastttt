/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * THE LAST SIGNAL — TEAM MEMBERSHIP & SUPABASE VERIFICATION SERVICE
 * 
 * Authoritative team creation, validation, and invite-code processing.
 * 
 * Rules:
 * 1. When Supabase is configured: operations call database RPCs directly.
 *    Failures display clear, authoritative errors — NO silent localStorage fallback.
 * 2. In offline prototype mode: operates on a local simulated multi-user store.
 * 3. Never leak service-role keys or bypass row-level security.
 */

import { supabase, isSupabaseConfigured } from './supabase';
import type { PrototypeUser, UserProgress } from './prototypeAuth';

export interface TeamMemberInfo {
  callSign: string;
  fullName?: string;
  joinedAt?: string;
  isCreator?: boolean;
}

export interface TeamData {
  name: string;
  inviteCode: string;
  isCreator: boolean;
  maxSize: number;
  membershipOpen: boolean;
  members: TeamMemberInfo[];
}

export interface TeamOperationResult {
  success: boolean;
  message: string;
  team?: TeamData;
  error?: string;
  mode: 'live_supabase' | 'prototype_local';
}

const LOCAL_TEAMS_KEY = 'tls_prototype_teams_v1';

interface LocalTeamRecord {
  name: string;
  code: string;
  creatorCallSign: string;
  createdAt: string;
  members: string[]; // callSigns
}

function getLocalTeams(): LocalTeamRecord[] {
  try {
    const raw = localStorage.getItem(LOCAL_TEAMS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalTeams(teams: LocalTeamRecord[]) {
  try {
    localStorage.setItem(LOCAL_TEAMS_KEY, JSON.stringify(teams));
  } catch (err) {
    console.warn('[teamService] Could not persist local teams:', err);
  }
}

/**
 * Fetch current team details for the active user.
 */
export async function fetchMyTeam(user: PrototypeUser): Promise<{
  inTeam: boolean;
  team: TeamData | null;
  error?: string;
  mode: 'live_supabase' | 'prototype_local';
}> {
  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase.rpc('get_my_team');
      if (error) {
        return {
          inTeam: false,
          team: null,
          error: error.message,
          mode: 'live_supabase',
        };
      }
      if (!data || !data.name) {
        return { inTeam: false, team: null, mode: 'live_supabase' };
      }

      const members: TeamMemberInfo[] = Array.isArray(data.members)
        ? data.members.map((username: string) => ({
            callSign: username,
            isCreator: username === user.callSign,
          }))
        : [{ callSign: user.callSign, isCreator: Boolean(data.is_creator) }];

      return {
        inTeam: true,
        team: {
          name: data.name,
          inviteCode: data.invite_code || '',
          isCreator: Boolean(data.is_creator),
          maxSize: data.max_size || 5,
          membershipOpen: data.membership_open !== false,
          members,
        },
        mode: 'live_supabase',
      };
    } catch (err) {
      return {
        inTeam: false,
        team: null,
        error: err instanceof Error ? err.message : 'Database connection error',
        mode: 'live_supabase',
      };
    }
  }

  // Local Prototype Mode
  const localTeams = getLocalTeams();
  const found = localTeams.find((t) => t.members.includes(user.callSign));
  if (!found) {
    return { inTeam: false, team: null, mode: 'prototype_local' };
  }

  return {
    inTeam: true,
    team: {
      name: found.name,
      inviteCode: found.code,
      isCreator: found.creatorCallSign === user.callSign,
      maxSize: 5,
      membershipOpen: true,
      members: found.members.map((m) => ({
        callSign: m,
        isCreator: m === found.creatorCallSign,
      })),
    },
    mode: 'prototype_local',
  };
}

/**
 * Create a new team.
 */
export async function createTeamAction(
  teamName: string,
  user: PrototypeUser,
  currentProgress: UserProgress,
  onUpdateProgress: (updater: (prev: UserProgress) => UserProgress) => void
): Promise<TeamOperationResult> {
  const cleanName = teamName.trim();
  if (cleanName.length < 3 || cleanName.length > 40) {
    return {
      success: false,
      message: 'Team designation must be between 3 and 40 characters.',
      mode: isSupabaseConfigured ? 'live_supabase' : 'prototype_local',
    };
  }

  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase.rpc('create_team', {
        p_name: cleanName,
      });

      if (error) {
        return {
          success: false,
          error: error.message,
          message: `Supabase team creation failed: ${error.message}`,
          mode: 'live_supabase',
        };
      }

      if (data?.status === 'ok') {
        const code = data.invite_code;
        onUpdateProgress((prev) => ({
          ...prev,
          teamName: cleanName,
          teamCode: code,
        }));
        return {
          success: true,
          message: `Unit "${cleanName}" established in departmental registry! Invite code: ${code}`,
          team: {
            name: cleanName,
            inviteCode: code,
            isCreator: true,
            maxSize: 5,
            membershipOpen: true,
            members: [{ callSign: user.callSign, isCreator: true }],
          },
          mode: 'live_supabase',
        };
      } else {
        const msgMap: Record<string, string> = {
          name_taken: 'A unit with this designation already exists.',
          already_in_team: 'You are already registered with an active unit.',
          progress_exists: 'Units cannot be formed after solo gameplay has progressed.',
          locked: 'Team registration window has closed.',
          invalid_name: 'Designation contains reserved or invalid terms.',
          unavailable: 'Team registry service is currently unavailable.',
        };
        const msg = msgMap[data?.status] || `Database rejected request (${data?.status || 'unknown'}).`;
        return {
          success: false,
          error: data?.status,
          message: msg,
          mode: 'live_supabase',
        };
      }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Database error',
        message: 'Could not contact Supabase team registry. Verify network connectivity.',
        mode: 'live_supabase',
      };
    }
  }

  // Local Prototype Mode
  const localTeams = getLocalTeams();
  if (localTeams.some((t) => t.name.toLowerCase() === cleanName.toLowerCase())) {
    return {
      success: false,
      message: 'A unit with this designation already exists in local registry.',
      mode: 'prototype_local',
    };
  }

  const code = `TLS-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
  const newRecord: LocalTeamRecord = {
    name: cleanName,
    code,
    creatorCallSign: user.callSign,
    createdAt: new Date().toISOString(),
    members: [user.callSign],
  };

  localTeams.push(newRecord);
  saveLocalTeams(localTeams);

  onUpdateProgress((prev) => ({
    ...prev,
    teamName: cleanName,
    teamCode: code,
  }));

  return {
    success: true,
    message: `Team "${cleanName}" created locally. Invite code: ${code}`,
    team: {
      name: cleanName,
      inviteCode: code,
      isCreator: true,
      maxSize: 5,
      membershipOpen: true,
      members: [{ callSign: user.callSign, isCreator: true }],
    },
    mode: 'prototype_local',
  };
}

/**
 * Join an existing team by invite code.
 */
export async function joinTeamAction(
  inviteCode: string,
  user: PrototypeUser,
  currentProgress: UserProgress,
  onUpdateProgress: (updater: (prev: UserProgress) => UserProgress) => void
): Promise<TeamOperationResult> {
  const cleanCode = inviteCode.trim().toUpperCase();
  if (!cleanCode) {
    return {
      success: false,
      message: 'Please provide a valid team invite code.',
      mode: isSupabaseConfigured ? 'live_supabase' : 'prototype_local',
    };
  }

  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase.rpc('join_team', {
        p_code: cleanCode,
      });

      if (error) {
        return {
          success: false,
          error: error.message,
          message: `Database verification failed: ${error.message}`,
          mode: 'live_supabase',
        };
      }

      if (data?.status === 'ok') {
        const teamName = data.team || 'Assigned Unit';
        onUpdateProgress((prev) => ({
          ...prev,
          teamName,
          teamCode: cleanCode,
        }));
        return {
          success: true,
          message: `Successfully joined unit "${teamName}". Shared dossier linked.`,
          mode: 'live_supabase',
        };
      } else {
        const msgMap: Record<string, string> = {
          invalid_code: `Invalid invite code "${cleanCode}". No active unit matches this code in Supabase.`,
          team_full: 'This unit has already reached its maximum capacity of 5 investigators.',
          already_in_team: 'Your account is already assigned to an active unit.',
          progress_exists: 'Accounts with previous solo progression cannot join an existing team.',
          rejoin_blocked: 'You have previously departed this unit and cannot rejoin without staff approval.',
          too_many_attempts: 'Security threshold exceeded. Please wait 10 minutes before trying another code.',
          locked: 'Team registration window is closed.',
          unavailable: 'Team registry service is currently unavailable.',
        };
        const msg = msgMap[data?.status] || `Verification rejected by Supabase (${data?.status || 'unknown'}).`;
        return {
          success: false,
          error: data?.status,
          message: msg,
          mode: 'live_supabase',
        };
      }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Database error',
        message: 'Could not verify team code against Supabase. Please verify network credentials.',
        mode: 'live_supabase',
      };
    }
  }

  // Local Prototype Mode
  const localTeams = getLocalTeams();
  const target = localTeams.find((t) => t.code.toUpperCase() === cleanCode);

  if (!target) {
    return {
      success: false,
      message: `Invalid invite code "${cleanCode}". No local unit matches this code.`,
      mode: 'prototype_local',
    };
  }

  if (target.members.length >= 5) {
    return {
      success: false,
      message: 'This unit has reached its capacity limit (5 operatives).',
      mode: 'prototype_local',
    };
  }

  if (!target.members.includes(user.callSign)) {
    target.members.push(user.callSign);
    saveLocalTeams(localTeams);
  }

  onUpdateProgress((prev) => ({
    ...prev,
    teamName: target.name,
    teamCode: target.code,
  }));

  return {
    success: true,
    message: `Joined unit "${target.name}". Dossier synchronized.`,
    team: {
      name: target.name,
      inviteCode: target.code,
      isCreator: target.creatorCallSign === user.callSign,
      maxSize: 5,
      membershipOpen: true,
      members: target.members.map((m) => ({
        callSign: m,
        isCreator: m === target.creatorCallSign,
      })),
    },
    mode: 'prototype_local',
  };
}

/**
 * Leave or disband current team.
 */
export async function leaveTeamAction(
  user: PrototypeUser,
  onUpdateProgress: (updater: (prev: UserProgress) => UserProgress) => void
): Promise<TeamOperationResult> {
  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase.rpc('leave_team');
      if (error) {
        return {
          success: false,
          error: error.message,
          message: `Failed to leave team: ${error.message}`,
          mode: 'live_supabase',
        };
      }
      if (data?.status === 'ok') {
        onUpdateProgress((prev) => ({
          ...prev,
          teamName: null,
          teamCode: null,
        }));
        return {
          success: true,
          message: 'Departed unit. Reverted to Solo Operative.',
          mode: 'live_supabase',
        };
      }
      return {
        success: false,
        error: data?.status,
        message: `Database rejected team departure: ${data?.status || 'unknown'}.`,
        mode: 'live_supabase',
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Database error',
        message: 'Could not contact database to process departure.',
        mode: 'live_supabase',
      };
    }
  }

  // Local Prototype Mode
  const localTeams = getLocalTeams();
  for (const t of localTeams) {
    t.members = t.members.filter((m) => m !== user.callSign);
  }
  saveLocalTeams(localTeams.filter((t) => t.members.length > 0));

  onUpdateProgress((prev) => ({
    ...prev,
    teamName: null,
    teamCode: null,
  }));

  return {
    success: true,
    message: 'Departed unit. Reverted to Solo Operative.',
    mode: 'prototype_local',
  };
}
