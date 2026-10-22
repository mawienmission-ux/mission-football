import { decode } from "base64-arraybuffer";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import type { User } from "@supabase/supabase-js";
import type {
  Club,
  Fixture,
  FootballData,
  League,
  Season,
  Standing,
} from "./footballData";
import { getLogoUrl, isSupabaseConfigured, supabase } from "./supabase";

type CatalogKind = "leagues" | "clubs" | "seasons" | "standings" | "matches";
type Entity = League | Club | Season | Standing | Fixture;
type Field = {
  key: string;
  label: string;
  numeric?: boolean;
  optional?: boolean;
  choices?: "leagues" | "clubs" | "seasons" | "match_status" | "regions";
};
type FormValues = Record<string, string>;

const entityTitles: Record<CatalogKind, string> = {
  leagues: "Leagues",
  clubs: "Clubs",
  seasons: "Seasons",
  standings: "Standings",
  matches: "Fixtures",
};

const entityFields: Record<CatalogKind, Field[]> = {
  leagues: [
    { key: "name", label: "League name" },
    { key: "country", label: "Country" },
    { key: "region", label: "Region", choices: "regions" },
  ],
  clubs: [
    { key: "name", label: "Club name" },
    { key: "short_name", label: "Short name", optional: true },
    { key: "country", label: "Country" },
  ],
  seasons: [
    { key: "league_id", label: "League", choices: "leagues" },
    { key: "name", label: "Season (e.g. 2025/26)" },
  ],
  standings: [
    { key: "season_id", label: "Season", choices: "seasons" },
    { key: "club_id", label: "Club", choices: "clubs" },
    { key: "played", label: "Played", numeric: true },
    { key: "wins", label: "Wins", numeric: true },
    { key: "draws", label: "Draws", numeric: true },
    { key: "losses", label: "Losses", numeric: true },
    { key: "goals_for", label: "Goals for", numeric: true },
    { key: "goals_against", label: "Goals against", numeric: true },
    { key: "points", label: "Points", numeric: true },
  ],
  matches: [
    { key: "league_id", label: "League", choices: "leagues" },
    { key: "season_id", label: "Season (optional)", choices: "seasons", optional: true },
    { key: "home_club_id", label: "Home club", choices: "clubs" },
    { key: "away_club_id", label: "Away club", choices: "clubs" },
    { key: "kickoff_at", label: "Kickoff (ISO, e.g. 2026-10-21T20:00:00Z)" },
    { key: "status", label: "Status", choices: "match_status" },
    { key: "home_score", label: "Home score", numeric: true, optional: true },
    { key: "away_score", label: "Away score", numeric: true, optional: true },
    { key: "minute", label: "Minute (optional)", numeric: true, optional: true },
  ],
};

const emptyData: FootballData = {
  leagues: [],
  clubs: [],
  seasons: [],
  standings: [],
  matches: [],
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "A network request failed.";
}

function recordValue(entity: Entity, key: string) {
  const record = { ...entity } as Record<string, string | number | null>;
  return String(record[key] ?? "");
}

function entityLabel(kind: CatalogKind, entity: Entity, data: FootballData) {
  if ("name" in entity && (kind === "leagues" || kind === "clubs")) return entity.name;
  if (kind === "seasons") {
    const season = entity as Season;
    const league = data.leagues.find((item) => item.id === season.league_id);
    return `${league?.name ?? "Unknown league"} · ${season.name}`;
  }
  if (kind === "standings") {
    const standing = entity as Standing;
    const club = data.clubs.find((item) => item.id === standing.club_id);
    const season = data.seasons.find((item) => item.id === standing.season_id);
    return `${club?.name ?? "Unknown club"} · ${season?.name ?? "Unknown season"} · ${standing.points} pts`;
  }
  const fixture = entity as Fixture;
  const home = data.clubs.find((item) => item.id === fixture.home_club_id);
  const away = data.clubs.find((item) => item.id === fixture.away_club_id);
  return `${home?.name ?? "Unknown club"} vs ${away?.name ?? "Unknown club"} · ${fixture.status}`;
}

export default function AdminPanel() {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [booting, setBooting] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [activeKind, setActiveKind] = useState<CatalogKind>("standings");
  const [data, setData] = useState<FootballData>(emptyData);
  const [loadingData, setLoadingData] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [values, setValues] = useState<FormValues>({});
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const verifyAdmin = useCallback(async (account: User) => {
    if (!supabase) return;
    try {
      const { data: admin, error: adminError } = await supabase
        .from("admin_users")
        .select("display_name,is_active")
        .eq("user_id", account.id)
        .maybeSingle();
      if (adminError) {
        setError(adminError.message);
        setUser(null);
        setIsAdmin(false);
        return;
      }
      if (!admin?.is_active) {
        setError("This account is not enabled as an administrator.");
        setUser(null);
        setIsAdmin(false);
        await supabase.auth.signOut();
        return;
      }
      setError("");
      setUser(account);
      setIsAdmin(true);
      setDisplayName(admin.display_name || String(account.user_metadata.display_name ?? ""));
    } catch (verificationError) {
      setError(errorMessage(verificationError));
      setUser(null);
      setIsAdmin(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    async function restoreSession() {
      if (!supabase) {
        setBooting(false);
        return;
      }
      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (!mounted) return;
        if (sessionError) setError(sessionError.message);
        if (sessionData.session?.user) await verifyAdmin(sessionData.session.user);
      } catch (sessionError) {
        if (mounted) setError(errorMessage(sessionError));
      } finally {
        if (mounted) setBooting(false);
      }
    }
    void restoreSession();
    return () => {
      mounted = false;
    };
  }, [verifyAdmin]);

  const refreshData = useCallback(async () => {
    if (!supabase) return;
    setLoadingData(true);
    setError("");
    try {
    const [leagues, clubs, seasons, standings, matches] = await Promise.all([
      supabase.from("leagues").select("id,name,country,region,logo_path").order("name"),
      supabase.from("clubs").select("id,name,short_name,country,logo_path").order("name"),
      supabase.from("seasons").select("id,league_id,name").order("name", { ascending: false }),
      supabase
        .from("standings")
        .select("id,season_id,club_id,played,wins,draws,losses,goals_for,goals_against,points"),
      supabase
        .from("matches")
        .select("id,league_id,season_id,home_club_id,away_club_id,kickoff_at,status,home_score,away_score,minute"),
    ]);
    const failure = [leagues, clubs, seasons, standings, matches].find((result) => result.error);
    if (failure?.error) {
      setError(failure.error.message);
      return;
    }
    setData({
      leagues: (leagues.data ?? []) as League[],
      clubs: (clubs.data ?? []) as Club[],
      seasons: (seasons.data ?? []) as Season[],
      standings: (standings.data ?? []) as Standing[],
      matches: (matches.data ?? []) as Fixture[],
    });
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) void refreshData();
  }, [isAdmin, refreshData]);

  const rows = data[activeKind] as Entity[];
  const fields = entityFields[activeKind];
  const editing = rows.find((row) => row.id === editingId) ?? null;

  const startNew = () => {
    setEditingId(null);
    setNotice("");
    setError("");
    const initial: FormValues = {};
    for (const field of fields) initial[field.key] = "";
    setValues(initial);
  };

  const startEditing = (entity: Entity) => {
    setEditingId(entity.id);
    setError("");
    setNotice("");
    const next: FormValues = {};
    for (const field of fields) next[field.key] = recordValue(entity, field.key);
    setValues(next);
  };

  const selectEntityKind = (kind: CatalogKind) => {
    setActiveKind(kind);
    setEditingId(null);
    setValues({});
    setError("");
    setNotice("");
  };

  const saveRecord = async () => {
    if (!supabase) return;
    setError("");
    setNotice("");
    const payload: Record<string, string | number | null> = {};
    for (const field of fields) {
      const value = (values[field.key] ?? "").trim();
      if (!value && !field.optional) {
        setError(`${field.label} is required.`);
        return;
      }
      if (!value && field.optional) {
        payload[field.key] = null;
      } else if (field.numeric) {
        if (!/^\d+$/.test(value)) {
          setError(`${field.label} must be a whole number of zero or more.`);
          return;
        }
        payload[field.key] = Number(value);
      } else {
        payload[field.key] = value;
      }
    }
    if (activeKind === "standings") {
      const played = Number(payload.played);
      const results = Number(payload.wins) + Number(payload.draws) + Number(payload.losses);
      if (results > played) {
        setError("Wins, draws, and losses cannot add up to more than matches played.");
        return;
      }
    }
    if (activeKind === "matches") {
      if (payload.home_club_id === payload.away_club_id) {
        setError("Choose different home and away clubs.");
        return;
      }
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2})$/.test(String(payload.kickoff_at))) {
        setError("Kickoff must be an ISO date and time with a timezone, such as 2026-10-21T20:00:00Z.");
        return;
      }
      if (!Number.isFinite(Date.parse(String(payload.kickoff_at)))) {
        setError("Kickoff date and time is invalid.");
        return;
      }
      if (
        payload.season_id &&
        data.seasons.find((season) => season.id === payload.season_id)?.league_id !==
          payload.league_id
      ) {
        setError("Choose a season belonging to the selected league.");
        return;
      }
    }

    setBusy(true);
    try {
      const result = editingId
        ? await supabase.from(activeKind).update(payload).eq("id", editingId)
        : await supabase.from(activeKind).insert(payload);
      if (result.error) {
        setError(result.error.message);
        return;
      }
      setNotice(editingId ? "Changes saved." : `${entityTitles[activeKind]} entry added.`);
      setEditingId(null);
      setValues({});
      await refreshData();
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setBusy(false);
    }
  };

  const deleteRecord = (entity: Entity) => {
    Alert.alert(
      `Delete ${entityLabel(activeKind, entity, data)}?`,
      activeKind === "leagues" || activeKind === "clubs"
        ? "Related fixtures, seasons, and standings may also be removed."
        : "This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void (async () => {
              if (!supabase) return;
              setBusy(true);
              setError("");
              try {
                const { error: deleteError } = await supabase
                  .from(activeKind)
                  .delete()
                  .eq("id", entity.id);
                if (deleteError) {
                  setError(deleteError.message);
                  return;
                }
                const logoPath =
                  activeKind === "leagues" || activeKind === "clubs"
                    ? (entity as League | Club).logo_path
                    : null;
                const { error: storageError } =
                  logoPath
                    ? await supabase.storage.from("football-logos").remove([logoPath])
                    : { error: null };
                if (editingId === entity.id) {
                  setEditingId(null);
                  setValues({});
                }
                await refreshData();
                if (storageError) {
                  setError(`Entry deleted, but its logo could not be removed: ${storageError.message}`);
                } else {
                  setNotice("Entry deleted.");
                }
              } catch (deleteError) {
                setError(errorMessage(deleteError));
              } finally {
                setBusy(false);
              }
            })();
          },
        },
      ],
    );
  };

  const uploadLogo = async () => {
    if (!supabase || !editingId || (activeKind !== "leagues" && activeKind !== "clubs")) {
      setError("Save this league or club before uploading its logo.");
      return;
    }
    try {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError("Allow photo library access to select a logo.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
      base64: true,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset.base64) {
      setError("The selected image could not be read. Please choose another image.");
      return;
    }
    if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) {
      setError("Choose a logo smaller than 5 MB.");
      return;
    }
    const contentType = asset.mimeType?.toLowerCase();
    if (
      contentType !== "image/png" &&
      contentType !== "image/jpeg" &&
      contentType !== "image/webp"
    ) {
      setError("Choose a PNG, JPEG, or WebP image.");
      return;
    }
    const extension =
      contentType === "image/png"
        ? "png"
        : contentType === "image/webp" ? "webp" : "jpg";
    const path = `${activeKind}/${editingId}.${extension}`;
    setBusy(true);
    setError("");
    setNotice("");
    const { error: uploadError } = await supabase.storage
      .from("football-logos")
      .upload(path, decode(asset.base64), {
        contentType,
        upsert: true,
      });
    if (uploadError) {
      setBusy(false);
      setError(uploadError.message);
      return;
    }
    const { error: updateError } = await supabase
      .from(activeKind)
      .update({ logo_path: path })
      .eq("id", editingId);
    setBusy(false);
    if (updateError) {
      const { error: cleanupError } = await supabase.storage
        .from("football-logos")
        .remove([path]);
      if (cleanupError) {
        setError(`${updateError.message} The new logo file also could not be removed: ${cleanupError.message}`);
        return;
      }
      setError(updateError.message);
      return;
    }
    const oldLogo = (editing as League | Club | null)?.logo_path;
    if (oldLogo && oldLogo !== path) {
      const { error: cleanupError } = await supabase.storage
        .from("football-logos")
        .remove([oldLogo]);
      if (cleanupError) {
        await refreshData();
        setError(`Logo uploaded, but the old logo could not be removed: ${cleanupError.message}`);
        return;
      }
    }
    setNotice("Logo uploaded.");
    await refreshData();
    } catch (uploadError) {
      setBusy(false);
      setError(errorMessage(uploadError));
    }
  };

  const login = async () => {
    if (!supabase) return;
    setBusy(true);
    setError("");
    try {
      const { data: result, error: loginError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (loginError) {
        setError(loginError.message);
        return;
      }
      if (result.user) await verifyAdmin(result.user);
      setPassword("");
    } catch (loginError) {
      setError(errorMessage(loginError));
    } finally {
      setBusy(false);
    }
  };

  const updateProfile = async () => {
    if (!supabase || !user) return;
    if (!displayName.trim()) {
      setError("Display name cannot be empty.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { error: profileError } = await supabase
        .from("admin_users")
        .update({ display_name: displayName.trim() })
        .eq("user_id", user.id);
      if (profileError) setError(profileError.message);
      else setNotice("Admin name updated.");
    } catch (profileError) {
      setError(errorMessage(profileError));
    } finally {
      setBusy(false);
    }
  };

  const updatePassword = async () => {
    if (!supabase) return;
    if (newPassword.length < 8) {
      setError("Use a new password with at least 8 characters.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { error: passwordError } = await supabase.auth.updateUser({ password: newPassword });
      if (passwordError) setError(passwordError.message);
      else {
        setNewPassword("");
        setNotice("Password updated.");
      }
    } catch (passwordError) {
      setError(errorMessage(passwordError));
    } finally {
      setBusy(false);
    }
  };

  const optionRows = useMemo(() => data, [data]);

  if (!isSupabaseConfigured) {
    return (
      <AdminShell>
        <Text style={styles.eyebrow}>ADMINISTRATION</Text>
        <Text style={styles.title}>Connect Supabase</Text>
        <Text style={styles.description}>
          Copy .env.example to .env, add your Supabase project URL and publishable key, then restart Expo.
          Follow the setup steps in README.md to create the protected admin database.
        </Text>
      </AdminShell>
    );
  }

  if (booting) {
    return (
      <AdminShell>
        <ActivityIndicator color="#C7F36B" />
        <Text style={styles.description}>Checking administrator access…</Text>
      </AdminShell>
    );
  }

  if (!user || !isAdmin) {
    return (
      <AdminShell>
        <Text style={styles.eyebrow}>RESTRICTED AREA</Text>
        <Text style={styles.title}>Admin sign in</Text>
        <Text style={styles.description}>
          Sign in with an account enabled in the Supabase admin_users table.
        </Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="Admin email"
          placeholderTextColor="#728077"
          style={styles.input}
        />
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="Password"
          placeholderTextColor="#728077"
          style={styles.input}
        />
        <ActionButton label="SIGN IN" onPress={() => void login()} disabled={busy} />
        {busy ? <ActivityIndicator color="#C7F36B" style={styles.spinner} /> : null}
        <Feedback error={error} notice={notice} />
      </AdminShell>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>WORLD FOOTBALL · ADMIN</Text>
          <Text style={styles.title}>Control room</Text>
        </View>
        <Pressable
          onPress={() => {
            void supabase?.auth.signOut();
            setUser(null);
            setIsAdmin(false);
          }}
        >
          <Text style={styles.linkText}>Sign out</Text>
        </Pressable>
      </View>
      <Text style={styles.description}>
        Manage clubs, leagues, seasons, historical results, and team badges.
      </Text>

      <View style={styles.profileCard}>
        <Text style={styles.cardTitle}>ADMIN PROFILE</Text>
        <TextInput
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="Display name"
          placeholderTextColor="#728077"
          style={styles.input}
        />
        <ActionButton label="UPDATE ADMIN NAME" onPress={() => void updateProfile()} disabled={busy} />
        <TextInput
          value={newPassword}
          onChangeText={setNewPassword}
          secureTextEntry
          placeholder="New password (8+ characters)"
          placeholderTextColor="#728077"
          style={styles.input}
        />
        <ActionButton label="CHANGE PASSWORD" onPress={() => void updatePassword()} disabled={busy} />
      </View>

      <Text style={styles.cardTitle}>FOOTBALL DATA</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.kindList}>
        {(["standings", "matches", "leagues", "clubs", "seasons"] as CatalogKind[]).map((kind) => (
          <Pressable
            key={kind}
            onPress={() => selectEntityKind(kind)}
            style={[styles.kindChip, activeKind === kind && styles.kindChipActive]}
          >
            <Text style={[styles.kindText, activeKind === kind && styles.kindTextActive]}>
              {entityTitles[kind]}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.editorCard}>
        <Text style={styles.cardTitle}>{editing ? "EDIT ENTRY" : `ADD ${activeKind.toUpperCase()}`}</Text>
        {fields.map((field) =>
          field.choices ? (
            <ChoiceField
              key={field.key}
              field={field}
              data={optionRows}
              value={values[field.key] ?? ""}
              leagueId={activeKind === "matches" ? values.league_id : undefined}
              onChange={(value) =>
                setValues((current) => ({
                  ...current,
                  [field.key]: value,
                  ...(activeKind === "matches" && field.key === "league_id"
                    ? { season_id: "" }
                    : {}),
                }))
              }
            />
          ) : (
            <TextInput
              key={field.key}
              value={values[field.key] ?? ""}
              onChangeText={(value) => setValues((current) => ({ ...current, [field.key]: value }))}
              keyboardType={field.numeric ? "number-pad" : "default"}
              autoCapitalize={field.numeric ? "none" : "words"}
              placeholder={field.label}
              placeholderTextColor="#728077"
              style={styles.input}
            />
          ),
        )}
        {editing && (activeKind === "leagues" || activeKind === "clubs") ? (
          <View style={styles.logoTools}>
            <ActionButton
              label="UPLOAD LOGO"
              onPress={() => void uploadLogo()}
              disabled={busy}
              secondary
            />
            <LogoPreview path={(editing as League | Club).logo_path} />
          </View>
        ) : null}
        <View style={styles.formActions}>
          <ActionButton
            label={busy ? "SAVING…" : editing ? "SAVE CHANGES" : "ADD ENTRY"}
            onPress={() => void saveRecord()}
            disabled={busy}
          />
          {editing ? (
            <Pressable onPress={startNew} style={styles.cancelButton}>
              <Text style={styles.cancelText}>Cancel edit</Text>
            </Pressable>
          ) : null}
        </View>
        <Feedback error={error} notice={notice} />
      </View>

      <View style={styles.listHeader}>
        <Text style={styles.cardTitle}>{entityTitles[activeKind].toUpperCase()}</Text>
        <Pressable onPress={() => void refreshData()}>
          <Text style={styles.linkText}>Refresh</Text>
        </Pressable>
      </View>
      {loadingData ? <ActivityIndicator color="#C7F36B" style={styles.spinner} /> : null}
      {rows.map((entity) => (
        <View key={entity.id} style={styles.entityRow}>
          <Pressable style={styles.entityTextArea} onPress={() => startEditing(entity)}>
            <Text numberOfLines={2} style={styles.entityName}>
              {entityLabel(activeKind, entity, data)}
            </Text>
            <Text style={styles.entityHint}>Tap to edit</Text>
          </Pressable>
          <Pressable
            style={styles.deleteButton}
            onPress={() => deleteRecord(entity)}
            accessibilityLabel={`Delete ${entityLabel(activeKind, entity, data)}`}
          >
            <Text style={styles.deleteText}>Delete</Text>
          </Pressable>
        </View>
      ))}
      {!loadingData && rows.length === 0 ? (
        <Text style={styles.description}>No {entityTitles[activeKind].toLowerCase()} yet. Add the first one above.</Text>
      ) : null}
      {error ? <Feedback error={error} notice="" /> : null}
    </ScrollView>
  );
}

function ChoiceField({
  field,
  data,
  value,
  onChange,
  leagueId,
}: {
  field: Field;
  data: FootballData;
  value: string;
  onChange: (value: string) => void;
  leagueId?: string;
}) {
  const options = (
    field.choices === "match_status"
      ? ["scheduled", "live", "finished"].map((status) => ({ id: status, name: status }))
      : field.choices === "regions"
        ? ["Europe", "Americas", "Asia", "Africa", "Oceania"].map((region) => ({ id: region, name: region }))
        : field.choices
          ? data[field.choices]
          : []
  ).filter(
    (option) =>
      field.choices !== "seasons" ||
      !leagueId ||
      ("league_id" in option && option.league_id === leagueId),
  );
  return (
    <View style={styles.choiceField}>
      <Text style={styles.fieldLabel}>{field.label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choiceList}>
        {options.map((option) => {
          const label =
            "league_id" in option
              ? `${option.name} · ${data.leagues.find((league) => league.id === option.league_id)?.name ?? "League"}`
              : option.name;
          return (
            <Pressable
              key={option.id}
              onPress={() => onChange(option.id)}
              style={[styles.choiceChip, value === option.id && styles.choiceChipActive]}
            >
              <Text style={[styles.choiceText, value === option.id && styles.choiceTextActive]}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {options.length === 0 ? (
        <Text style={styles.fieldHint}>Add {field.choices} before creating this entry.</Text>
      ) : null}
    </View>
  );
}

function LogoPreview({ path }: { path: string | null }) {
  const uri = getLogoUrl(path);
  return uri ? <Image source={{ uri }} style={styles.logoPreview} /> : null;
}

function Feedback({ error, notice }: { error: string; notice: string }) {
  if (!error && !notice) return null;
  return (
    <Text style={[styles.feedback, error ? styles.errorText : styles.noticeText]}>
      {error || notice}
    </Text>
  );
}

function ActionButton({
  label,
  onPress,
  disabled,
  secondary,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.actionButton,
        secondary && styles.secondaryAction,
        disabled && styles.disabled,
      ]}
    >
      <Text style={[styles.actionText, secondary && styles.secondaryActionText]}>{label}</Text>
    </Pressable>
  );
}

function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.loginContent}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#08110E" },
  content: { paddingHorizontal: 20, paddingTop: 22, paddingBottom: 36 },
  loginContent: { paddingHorizontal: 22, paddingTop: 34, paddingBottom: 36 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  eyebrow: { color: "#A6C77B", fontSize: 9, fontWeight: "800", letterSpacing: 1.7 },
  title: { color: "#F3F5EF", fontSize: 29, fontWeight: "900", marginTop: 6 },
  description: { color: "#96A299", fontSize: 12, lineHeight: 19, marginTop: 10, marginBottom: 18 },
  input: { minHeight: 44, borderRadius: 10, borderWidth: 1, borderColor: "#304036", backgroundColor: "#0D1712", color: "#F0F4EC", paddingHorizontal: 12, paddingVertical: 10, fontSize: 12, marginTop: 9 },
  actionButton: { minHeight: 40, paddingHorizontal: 14, borderRadius: 10, backgroundColor: "#C7F36B", alignItems: "center", justifyContent: "center" },
  actionText: { color: "#14200F", fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  secondaryAction: { backgroundColor: "#17241B", borderWidth: 1, borderColor: "#3B5140" },
  secondaryActionText: { color: "#D4E8B1" },
  disabled: { opacity: 0.55 },
  profileCard: { borderWidth: 1, borderColor: "#29382F", borderRadius: 15, backgroundColor: "#111B16", padding: 14, marginBottom: 23 },
  editorCard: { borderWidth: 1, borderColor: "#29382F", borderRadius: 15, backgroundColor: "#111B16", padding: 14, marginBottom: 21 },
  cardTitle: { color: "#B9C9B8", fontSize: 9, fontWeight: "900", letterSpacing: 1.4 },
  kindList: { gap: 8, paddingVertical: 12 },
  kindChip: { borderRadius: 12, borderWidth: 1, borderColor: "#2A392F", paddingHorizontal: 13, paddingVertical: 9, backgroundColor: "#101A15" },
  kindChipActive: { backgroundColor: "#C7F36B", borderColor: "#C7F36B" },
  kindText: { color: "#9CA89F", fontSize: 10, fontWeight: "800" },
  kindTextActive: { color: "#14200F" },
  choiceField: { marginTop: 12 },
  fieldLabel: { color: "#9AA69D", fontSize: 10, fontWeight: "700", marginBottom: 7 },
  choiceList: { gap: 6 },
  choiceChip: { borderRadius: 9, borderWidth: 1, borderColor: "#34453A", paddingHorizontal: 10, paddingVertical: 8 },
  choiceChipActive: { backgroundColor: "#243A28", borderColor: "#9FBE6D" },
  choiceText: { color: "#A9B5AA", fontSize: 9, fontWeight: "700" },
  choiceTextActive: { color: "#D9F5A6" },
  fieldHint: { color: "#78867D", fontSize: 9, marginTop: 5 },
  formActions: { gap: 8, marginTop: 13 },
  logoTools: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 13 },
  logoPreview: { width: 38, height: 38, borderRadius: 12 },
  cancelButton: { alignItems: "center", paddingVertical: 9 },
  cancelText: { color: "#A4B0A7", fontSize: 10, fontWeight: "700" },
  feedback: { fontSize: 11, lineHeight: 16, marginTop: 10 },
  errorText: { color: "#FF9D91" },
  noticeText: { color: "#C7F36B" },
  linkText: { color: "#C5E898", fontSize: 10, fontWeight: "800" },
  spinner: { marginTop: 12 },
  listHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  entityRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 54, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 11, backgroundColor: "#111B16", borderWidth: 1, borderColor: "#26342B", marginBottom: 7 },
  entityTextArea: { flex: 1, paddingRight: 10 },
  entityName: { color: "#E3E9E0", fontSize: 11, fontWeight: "700" },
  entityHint: { color: "#76847A", fontSize: 8, marginTop: 3 },
  deleteButton: { paddingVertical: 8, paddingHorizontal: 9, borderRadius: 8, borderWidth: 1, borderColor: "#553A37" },
  deleteText: { color: "#E99A8C", fontSize: 9, fontWeight: "800" },
});
