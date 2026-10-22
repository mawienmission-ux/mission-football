import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { Club, League, Season, Standing } from "./footballData";
import { getLogoUrl, isSupabaseConfigured, supabase } from "./supabase";

const emptyData = {
  leagues: [],
  clubs: [],
  seasons: [],
  standings: [],
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "A network request failed.";
}

export default function StandingsScreen() {
  const [data, setData] = useState<{
    leagues: League[];
    clubs: Club[];
    seasons: Season[];
    standings: Standing[];
  }>(emptyData);
  const [selectedLeagueId, setSelectedLeagueId] = useState<string | null>(null);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
    const [leagues, clubs, seasons, standings] = await Promise.all([
      supabase.from("leagues").select("id,name,country,region,logo_path").order("name"),
      supabase.from("clubs").select("id,name,short_name,country,logo_path").order("name"),
      supabase.from("seasons").select("id,league_id,name").order("name", { ascending: false }),
      supabase
        .from("standings")
        .select("id,season_id,club_id,played,wins,draws,losses,goals_for,goals_against,points"),
    ]);
    const failed = [leagues, clubs, seasons, standings].find((result) => result.error);
    if (failed?.error) {
      setError(failed.error.message);
      return;
    }
    const nextData = {
      leagues: (leagues.data ?? []) as League[],
      clubs: (clubs.data ?? []) as Club[],
      seasons: (seasons.data ?? []) as Season[],
      standings: (standings.data ?? []) as Standing[],
    };
    setData(nextData);
    setSelectedLeagueId((current) =>
      current && nextData.leagues.some((league) => league.id === current)
        ? current
        : (nextData.leagues[0]?.id ?? null),
    );
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const leagueSeasons = useMemo(
    () => data.seasons.filter((season) => season.league_id === selectedLeagueId),
    [data.seasons, selectedLeagueId],
  );

  useEffect(() => {
    setSelectedSeasonId((current) =>
      current && leagueSeasons.some((season) => season.id === current)
        ? current
        : (leagueSeasons[0]?.id ?? null),
    );
  }, [leagueSeasons]);

  const selectedLeague = data.leagues.find((league) => league.id === selectedLeagueId);
  const selectedSeason = leagueSeasons.find((season) => season.id === selectedSeasonId);
  const clubMap = new Map(data.clubs.map((club) => [club.id, club]));
  const rows = data.standings
    .filter((standing) => standing.season_id === selectedSeasonId)
    .slice()
    .sort(
      (a, b) =>
        b.points - a.points ||
        b.goals_for - b.goals_against - (a.goals_for - a.goals_against) ||
        b.goals_for - a.goals_for ||
        (clubMap.get(a.club_id)?.name ?? "").localeCompare(clubMap.get(b.club_id)?.name ?? ""),
    );

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headingRow}>
        <View>
          <Text style={styles.eyebrow}>THE NUMBERS THAT MATTER</Text>
          <Text style={styles.title}>League table</Text>
        </View>
        <Pressable onPress={() => void load()} accessibilityLabel="Refresh standings">
          <Text style={styles.refresh}>↻</Text>
        </Pressable>
      </View>

      {!isSupabaseConfigured ? (
        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>Connect your football database</Text>
          <Text style={styles.noticeCopy}>
            Add your Supabase URL and publishable key to .env, then restart Expo to load league tables.
          </Text>
        </View>
      ) : null}

      {data.leagues.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.choices}
        >
          {data.leagues.map((league) => (
            <Pressable
              key={league.id}
              onPress={() => setSelectedLeagueId(league.id)}
              style={[
                styles.choice,
                selectedLeagueId === league.id && styles.choiceActive,
              ]}
            >
              <Text
                style={[
                  styles.choiceText,
                  selectedLeagueId === league.id && styles.choiceTextActive,
                ]}
              >
                {league.name}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      {selectedLeague ? (
        <View style={styles.leagueIdentity}>
          <Logo path={selectedLeague.logo_path} size={42} fallback={selectedLeague.name} />
          <View style={styles.leagueIdentityText}>
            <Text style={styles.leagueName}>{selectedLeague.name}</Text>
            <Text style={styles.leagueCountry}>
              {selectedLeague.country} · {selectedLeague.region}
            </Text>
          </View>
        </View>
      ) : null}

      {leagueSeasons.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.seasonChoices}
        >
          {leagueSeasons.map((season) => (
            <Pressable
              key={season.id}
              onPress={() => setSelectedSeasonId(season.id)}
              style={[
                styles.seasonChoice,
                selectedSeasonId === season.id && styles.seasonChoiceActive,
              ]}
            >
              <Text
                style={[
                  styles.seasonChoiceText,
                  selectedSeasonId === season.id && styles.seasonChoiceTextActive,
                ]}
              >
                {season.name}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      <View style={styles.table}>
        <View style={styles.tableTitleRow}>
          <View>
            <Text style={styles.tableTitle}>
              {selectedSeason?.name ?? "Season standings"}
            </Text>
            <Text style={styles.tableCaption}>HISTORICAL POINTS & RESULTS</Text>
          </View>
          {selectedLeague ? (
            <Logo path={selectedLeague.logo_path} size={28} fallback={selectedLeague.name} />
          ) : null}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View>
            <View style={styles.columnHeader}>
              <Text style={[styles.columnText, styles.rankCol]}>#</Text>
              <Text style={[styles.columnText, styles.clubCol]}>CLUB</Text>
              <Text style={styles.columnText}>P</Text>
              <Text style={styles.columnText}>W</Text>
              <Text style={styles.columnText}>D</Text>
              <Text style={styles.columnText}>L</Text>
              <Text style={styles.columnText}>GD</Text>
              <Text style={[styles.columnText, styles.pointsCol]}>PTS</Text>
            </View>
            {rows.map((standing, index) => (
              <StandingRow
                key={standing.id}
                standing={standing}
                club={clubMap.get(standing.club_id)}
                rank={index + 1}
              />
            ))}
          </View>
        </ScrollView>

        {loading ? (
          <ActivityIndicator color="#C7F36B" style={styles.status} />
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {!loading && !error && (!selectedSeason || rows.length === 0) ? (
          <Text style={styles.empty}>
            {data.leagues.length === 0
              ? "No leagues have been added yet."
              : "No standings are available for this season yet."}
          </Text>
        ) : null}
      </View>
      <Text style={styles.footnote}>
        RANKED BY POINTS, GOAL DIFFERENCE, THEN GOALS SCORED
      </Text>
    </ScrollView>
  );
}

function Logo({
  path,
  size,
  fallback,
}: {
  path: string | null | undefined;
  size: number;
  fallback: string;
}) {
  const uri = getLogoUrl(path);
  return uri ? (
    <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 3 }} />
  ) : (
    <View
      style={[
        styles.logoFallback,
        { width: size, height: size, borderRadius: size / 3 },
      ]}
    >
      <Text style={styles.logoFallbackText}>{fallback.slice(0, 1).toUpperCase()}</Text>
    </View>
  );
}

function StandingRow({
  standing,
  club,
  rank,
}: {
  standing: Standing;
  club: Club | undefined;
  rank: number;
}) {
  const goalDifference = standing.goals_for - standing.goals_against;
  return (
    <View style={[styles.tableRow, rank === 1 && styles.topRow]}>
      <Text style={[styles.rankText, styles.rankCol]}>{rank}</Text>
      <View style={styles.clubCol}>
        <Logo path={club?.logo_path} size={25} fallback={club?.name ?? "?"} />
        <Text numberOfLines={1} style={styles.clubName}>
          {club?.name ?? "Unknown club"}
        </Text>
      </View>
      <Text style={styles.cellText}>{standing.played}</Text>
      <Text style={styles.cellText}>{standing.wins}</Text>
      <Text style={styles.cellText}>{standing.draws}</Text>
      <Text style={styles.cellText}>{standing.losses}</Text>
      <Text style={styles.cellText}>
        {goalDifference > 0 ? `+${goalDifference}` : goalDifference}
      </Text>
      <Text style={[styles.pointsText, styles.pointsCol]}>{standing.points}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#08110E" },
  content: { paddingHorizontal: 22, paddingTop: 24, paddingBottom: 30 },
  headingRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  eyebrow: { color: "#A6C77B", fontSize: 9, fontWeight: "800", letterSpacing: 1.7 },
  title: { color: "#F3F5EF", fontSize: 31, fontWeight: "900", marginTop: 6 },
  refresh: { color: "#C7F36B", fontSize: 26, paddingHorizontal: 8 },
  notice: { marginTop: 20, padding: 15, borderRadius: 14, borderWidth: 1, borderColor: "#3A4A3D", backgroundColor: "#142019" },
  noticeTitle: { color: "#E8F3D9", fontSize: 14, fontWeight: "800" },
  noticeCopy: { color: "#A6B1A8", fontSize: 12, lineHeight: 18, marginTop: 6 },
  choices: { gap: 8, paddingVertical: 18 },
  choice: { paddingHorizontal: 13, paddingVertical: 9, borderRadius: 14, backgroundColor: "#111B16", borderWidth: 1, borderColor: "#28362E" },
  choiceActive: { backgroundColor: "#C7F36B", borderColor: "#C7F36B" },
  choiceText: { color: "#A7B1A8", fontSize: 10, fontWeight: "800" },
  choiceTextActive: { color: "#14200F" },
  leagueIdentity: { flexDirection: "row", alignItems: "center", gap: 11, marginTop: 4, marginBottom: 15 },
  leagueIdentityText: { gap: 3 },
  leagueName: { color: "#EEF2E9", fontSize: 16, fontWeight: "800" },
  leagueCountry: { color: "#849188", fontSize: 10, fontWeight: "700" },
  seasonChoices: { gap: 7, paddingBottom: 16 },
  seasonChoice: { borderWidth: 1, borderColor: "#2A372F", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  seasonChoiceActive: { borderColor: "#9FBE6D", backgroundColor: "#1A2A1D" },
  seasonChoiceText: { color: "#98A39A", fontSize: 10, fontWeight: "700" },
  seasonChoiceTextActive: { color: "#D8EAAE" },
  table: { backgroundColor: "#111B16", borderColor: "#26342B", borderWidth: 1, borderRadius: 16, padding: 13 },
  tableTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 13 },
  tableTitle: { color: "#F0F3EB", fontSize: 15, fontWeight: "800" },
  tableCaption: { color: "#78867D", fontSize: 8, fontWeight: "800", letterSpacing: 1.2, marginTop: 4 },
  columnHeader: { height: 31, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#2A372F" },
  columnText: { color: "#78867D", width: 30, textAlign: "center", fontSize: 8, fontWeight: "900" },
  rankCol: { width: 24, textAlign: "left" },
  clubCol: { width: 135, flexDirection: "row", alignItems: "center", gap: 8 },
  pointsCol: { width: 36, textAlign: "right" },
  tableRow: { minHeight: 48, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#202D25" },
  topRow: { backgroundColor: "#15231A" },
  rankText: { color: "#BBC6BC", fontSize: 10, fontWeight: "800" },
  clubName: { color: "#E3E9E0", fontSize: 10, fontWeight: "700", flex: 1 },
  cellText: { color: "#A8B2AA", width: 30, textAlign: "center", fontSize: 9, fontWeight: "600" },
  pointsText: { color: "#D9F5A6", fontSize: 11, fontWeight: "900" },
  logoFallback: { backgroundColor: "#26382A", alignItems: "center", justifyContent: "center" },
  logoFallbackText: { color: "#C7F36B", fontSize: 12, fontWeight: "900" },
  status: { marginTop: 18 },
  error: { color: "#FF9D91", fontSize: 11, marginTop: 14 },
  empty: { color: "#8F9B91", fontSize: 12, lineHeight: 18, paddingVertical: 18 },
  footnote: { color: "#66736A", fontSize: 8, fontWeight: "700", letterSpacing: 1, textAlign: "center", marginTop: 16 },
});
