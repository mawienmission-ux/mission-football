import { useEffect, useState } from "react";
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  StatusBar,
  Text,
  View,
} from "react-native";
import AdminPanel from "./AdminPanel";
import type { Club, Fixture, League } from "./footballData";
import StandingsScreen from "./StandingsScreen";
import { isSupabaseConfigured, supabase } from "./supabase";

type Match = {
  competition: string;
  region: string;
  home: string;
  away: string;
  homeMark: string;
  awayMark: string;
  time: string;
  score?: string;
  live?: boolean;
};

const demoMatches: Match[] = [
  {
    competition: "Premier League",
    region: "Europe",
    home: "Arsenal",
    away: "Liverpool",
    homeMark: "A",
    awayMark: "L",
    time: "LIVE  ·  67′",
    score: "2  —  1",
    live: true,
  },
  {
    competition: "La Liga",
    region: "Europe",
    home: "Real Madrid",
    away: "Barcelona",
    homeMark: "R",
    awayMark: "B",
    time: "Today, 20:00",
  },
  {
    competition: "Brasileirão",
    region: "Americas",
    home: "Flamengo",
    away: "Palmeiras",
    homeMark: "F",
    awayMark: "P",
    time: "Today, 21:30",
  },
];

const filters = ["For you", "Europe", "Americas", "Asia", "Africa", "Oceania"];

function SectionHeading({
  title,
  action,
  onAction,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.sectionHeading}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={styles.textAction}>{action}  ›</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function MatchCard({ match }: { match: Match }) {
  return (
    <View style={styles.matchCard}>
      <View style={styles.matchTopline}>
        <View style={styles.competitionLabel}>
          <View style={styles.competitionDot} />
          <Text style={styles.competitionText}>{match.competition}</Text>
          <Text style={styles.regionText}> · {match.region}</Text>
        </View>
        <Text style={[styles.matchTime, match.live && styles.liveText]}>
          {match.time}
        </Text>
      </View>
      <View style={styles.teamsRow}>
        <View style={styles.team}>
          <View style={[styles.teamMark, match.homeMark === "A" && styles.redMark]}>
            <Text style={styles.teamMarkText}>{match.homeMark}</Text>
          </View>
          <Text style={styles.teamName}>{match.home}</Text>
        </View>
        {match.score ? (
          <Text style={styles.score}>{match.score}</Text>
        ) : (
          <Text style={styles.versus}>VS</Text>
        )}
        <View style={[styles.team, styles.awayTeam]}>
          <Text style={styles.teamName}>{match.away}</Text>
          <View style={[styles.teamMark, match.awayMark === "B" && styles.blueMark]}>
            <Text style={styles.teamMarkText}>{match.awayMark}</Text>
          </View>
        </View>
      </View>
      <View style={styles.cardFooter}>
        <Text style={styles.cardFooterText}>Match centre</Text>
        <Text style={styles.chevron}>↗</Text>
      </View>
    </View>
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "A network request failed.";
}

export default function App() {
  const [activeFilter, setActiveFilter] = useState("For you");
  const [activeTab, setActiveTab] = useState("Home");
  const [matchItems, setMatchItems] = useState(demoMatches);
  const [matchError, setMatchError] = useState("");
  const [usingRemoteFixtures, setUsingRemoteFixtures] = useState(false);
  const featuredMatch = matchItems.find((match) => match.live) ?? matchItems[0] ?? null;
  const dateLabel = new Date()
    .toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
    })
    .toUpperCase();

  useEffect(() => {
    const client = supabase;
    if (!client || activeTab !== "Home") return;
    let mounted = true;
    async function loadFixtures() {
      if (!client) return;
      try {
      const [fixtureResult, clubResult, leagueResult] = await Promise.all([
        client
          .from("matches")
          .select("id,league_id,season_id,home_club_id,away_club_id,kickoff_at,status,home_score,away_score,minute")
          .order("kickoff_at"),
        client.from("clubs").select("id,name,short_name,country,logo_path"),
        client.from("leagues").select("id,name,country,region,logo_path"),
      ]);
      if (!mounted) return;
      const failure = [fixtureResult, clubResult, leagueResult].find((result) => result.error);
      if (failure?.error) {
        setMatchError(failure.error.message);
        return;
      }
      const fixtures = (fixtureResult.data ?? []) as Fixture[];
      const statusOrder = { live: 0, scheduled: 1, finished: 2 };
      fixtures.sort((first, second) => {
        const statusDifference = statusOrder[first.status] - statusOrder[second.status];
        if (statusDifference !== 0) return statusDifference;
        const kickoffDifference =
          Date.parse(first.kickoff_at) - Date.parse(second.kickoff_at);
        return first.status === "finished" ? -kickoffDifference : kickoffDifference;
      });
      const clubs = (clubResult.data ?? []) as Club[];
      const leagues = (leagueResult.data ?? []) as League[];
      const clubMap = new Map(clubs.map((club) => [club.id, club]));
      const leagueMap = new Map(leagues.map((league) => [league.id, league]));
      const formatted = fixtures.flatMap((fixture): Match[] => {
        const home = clubMap.get(fixture.home_club_id);
        const away = clubMap.get(fixture.away_club_id);
        const league = leagueMap.get(fixture.league_id);
        if (!home || !away || !league) return [];
        const kickoff = new Date(fixture.kickoff_at);
        const time =
          fixture.status === "live"
            ? fixture.minute === null
              ? "LIVE"
              : `LIVE  ·  ${fixture.minute}′`
            : fixture.status === "finished"
              ? "FULL TIME"
              : kickoff.toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                });
        const hasScore = fixture.home_score !== null && fixture.away_score !== null;
        return [
          {
            competition: league.name,
            region: league.region,
            home: home.name,
            away: away.name,
            homeMark: home.short_name || home.name.slice(0, 1),
            awayMark: away.short_name || away.name.slice(0, 1),
            time,
            score: hasScore ? `${fixture.home_score}  —  ${fixture.away_score}` : undefined,
            live: fixture.status === "live",
          },
        ];
      });
      setMatchItems(formatted);
      setMatchError("");
      setUsingRemoteFixtures(true);
      } catch (error) {
        if (mounted) setMatchError(errorMessage(error));
      }
    }
    void loadFixtures();
    return () => {
      mounted = false;
    };
  }, [activeTab]);

  const visibleMatches =
    activeFilter === "For you"
      ? matchItems
      : matchItems.filter(
          (match) => match.region.toLowerCase() === activeFilter.toLowerCase(),
        );

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />
      {activeTab === "Table" ? (
        <StandingsScreen />
      ) : activeTab === "Admin" ? (
        <AdminPanel />
      ) : (
        <ScrollView
          style={styles.screen}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
        <View style={styles.header}>
          <View style={styles.brand}>
            <View style={styles.brandBall}>
              <Text style={styles.brandBallText}>✦</Text>
            </View>
            <View>
              <Text style={styles.brandName}>THE TOUCHLINE</Text>
              <Text style={styles.brandCaption}>FOOTBALL, EVERYWHERE</Text>
            </View>
          </View>
          <Pressable style={styles.avatar} accessibilityLabel="Open your profile">
            <Text style={styles.avatarText}>M</Text>
          </Pressable>
        </View>

        <View style={styles.greeting}>
          <Text style={styles.eyebrow}>{dateLabel}</Text>
          <Text style={styles.pageTitle}>
            The world{"\n"}is playing.
          </Text>
          <Text style={styles.pageSubtitle}>
            Your front row seat to the beautiful game.
          </Text>
        </View>

        {featuredMatch ? (
        <View style={styles.featureCard}>
          <View style={styles.featureGlow} />
          <View style={styles.featureTopline}>
            <View style={styles.livePill}>
              <View style={styles.liveDot} />
              <Text style={styles.livePillText}>
                {featuredMatch.live ? "ON NOW" : "MATCHDAY"}
              </Text>
            </View>
            <Text style={styles.featureLeague}>
              {featuredMatch.competition.toUpperCase()} · {featuredMatch.region.toUpperCase()}
            </Text>
          </View>
          <Text numberOfLines={2} style={styles.featureTitle}>
            {featuredMatch.home}{"\n"}vs {featuredMatch.away}
          </Text>
          <View style={styles.featureMatchRow}>
            <View style={styles.featureTeam}>
              <View style={styles.featureBadge}>
                <Text style={styles.featureBadgeText}>{featuredMatch.homeMark}</Text>
              </View>
              <Text style={styles.featureTeamName}>{featuredMatch.homeMark}</Text>
            </View>
            <View style={styles.featureScoreWrap}>
              <Text style={styles.featureScore}>{featuredMatch.score ?? "VS"}</Text>
              <Text style={styles.featureMinute}>
                {featuredMatch.live ? featuredMatch.time : "UP NEXT"}
              </Text>
            </View>
            <View style={styles.featureTeam}>
              <View style={[styles.featureBadge, styles.liverpoolBadge]}>
                <Text style={styles.featureBadgeText}>{featuredMatch.awayMark}</Text>
              </View>
              <Text style={styles.featureTeamName}>{featuredMatch.awayMark}</Text>
            </View>
          </View>
          <Pressable style={styles.featureButton}>
            <Text style={styles.featureButtonText}>FOLLOW THE MATCH</Text>
            <Text style={styles.featureButtonArrow}>↗</Text>
          </Pressable>
        </View>
        ) : (
          <View style={styles.featureCard}>
            <Text style={styles.featureTitle}>No fixtures yet.</Text>
            <Text style={styles.pageSubtitle}>
              An administrator can add matches from the Admin tab.
            </Text>
          </View>
        )}

        <View style={styles.sectionBlock}>
          <SectionHeading
            title="Around the world"
            action="All fixtures"
            onAction={() => setActiveFilter("For you")}
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterList}
          >
            {filters.map((filter) => (
              <Pressable
                key={filter}
                onPress={() => setActiveFilter(filter)}
                style={[
                  styles.filterChip,
                  activeFilter === filter && styles.filterChipActive,
                ]}
              >
                <Text
                  style={[
                    styles.filterText,
                    activeFilter === filter && styles.filterTextActive,
                  ]}
                >
                  {filter}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          <View style={styles.matchList}>
            {visibleMatches.map((match) => (
              <MatchCard key={`${match.home}-${match.away}`} match={match} />
            ))}
            {visibleMatches.length === 0 ? (
              <Text style={styles.emptyMessage}>
                {matchItems.length === 0
                  ? "No fixtures have been added yet."
                  : `No fixtures in ${activeFilter} yet.`}
              </Text>
            ) : null}
          </View>
          {matchError ? <Text style={styles.matchError}>{matchError}</Text> : null}
        </View>

        <View style={styles.newsSection}>
          <SectionHeading title="The latest" action="All stories" />
          <View style={styles.newsCard}>
            <View style={styles.newsArt}>
              <View style={styles.newsOrb} />
              <Text style={styles.newsArtLabel}>WORLD{"\n"}FOOTBALL</Text>
              <Text style={styles.newsArtBall}>◉</Text>
            </View>
            <View style={styles.newsCopy}>
              <Text style={styles.newsCategory}>THE GLOBAL GAME  ·  4 MIN READ</Text>
              <Text style={styles.newsTitle}>
                A new generation is changing the way the world plays.
              </Text>
              <Text style={styles.newsByline}>THE TOUCHLINE EDITORS</Text>
            </View>
          </View>
        </View>
        <Text style={styles.disclaimer}>
          {usingRemoteFixtures
            ? "ADMIN-ENTERED FIXTURES & SCORES · NO LIVE DATA FEED"
            : "SAMPLE FIXTURES & SCORES · NOT LIVE DATA"}
        </Text>
        </ScrollView>
      )}

      <View style={styles.tabBar}>
        {[
          { label: "Home", icon: "⌂" },
          { label: "Table", icon: "▤" },
          { label: "Admin", icon: "⚙" },
        ].map((tab) => (
          <Pressable
            key={tab.label}
            onPress={() => setActiveTab(tab.label)}
            style={styles.tab}
          >
            <Text style={[styles.tabIcon, activeTab === tab.label && styles.tabActive]}>
              {tab.icon}
            </Text>
            <Text style={[styles.tabLabel, activeTab === tab.label && styles.tabActive]}>
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#08110E",
  },
  screen: {
    flex: 1,
    backgroundColor: "#08110E",
  },
  content: {
    paddingHorizontal: 22,
    paddingBottom: 28,
  },
  header: {
    height: 66,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  brandBall: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: "#C7F36B",
    alignItems: "center",
    justifyContent: "center",
  },
  brandBallText: {
    color: "#102013",
    fontSize: 22,
    fontWeight: "900",
  },
  brandName: {
    color: "#F2F4EE",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.7,
  },
  brandCaption: {
    color: "#78847B",
    fontSize: 8,
    marginTop: 4,
    letterSpacing: 1.6,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "#344039",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#17211B",
  },
  avatarText: {
    color: "#D7E6CE",
    fontSize: 12,
    fontWeight: "800",
  },
  greeting: {
    paddingTop: 22,
    paddingBottom: 22,
  },
  eyebrow: {
    color: "#A6C77B",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 2.1,
    marginBottom: 10,
  },
  pageTitle: {
    color: "#F3F5EF",
    fontSize: 42,
    lineHeight: 44,
    fontWeight: "900",
    letterSpacing: -1.5,
  },
  pageSubtitle: {
    color: "#88948B",
    fontSize: 13,
    marginTop: 10,
  },
  featureCard: {
    minHeight: 246,
    overflow: "hidden",
    borderRadius: 20,
    padding: 18,
    backgroundColor: "#1A2C20",
    borderWidth: 1,
    borderColor: "#314633",
  },
  featureGlow: {
    position: "absolute",
    width: 210,
    height: 210,
    borderRadius: 105,
    right: -70,
    top: 26,
    backgroundColor: "#29462C",
    opacity: 0.56,
  },
  featureTopline: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  livePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 12,
    backgroundColor: "#2C4430",
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#C7F36B",
  },
  livePillText: {
    color: "#D9F5A6",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1,
  },
  featureLeague: {
    color: "#B0C0AE",
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 1.1,
  },
  featureTitle: {
    color: "#F3F5EF",
    fontSize: 22,
    lineHeight: 25,
    fontWeight: "800",
    marginTop: 15,
    letterSpacing: -0.5,
  },
  featureMatchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 16,
    marginBottom: 15,
  },
  featureTeam: {
    alignItems: "center",
    width: 50,
  },
  featureBadge: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: "#D64A47",
    alignItems: "center",
    justifyContent: "center",
  },
  liverpoolBadge: {
    backgroundColor: "#B84A40",
  },
  featureBadgeText: {
    color: "white",
    fontSize: 15,
    fontWeight: "900",
  },
  featureTeamName: {
    color: "#E5EADF",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.4,
    marginTop: 4,
  },
  featureScoreWrap: {
    alignItems: "center",
  },
  featureScore: {
    color: "#F6F8F0",
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: 2,
  },
  featureMinute: {
    color: "#C7F36B",
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 1.7,
    marginTop: 3,
  },
  featureButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 11,
    backgroundColor: "#C7F36B",
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  featureButtonText: {
    color: "#14200F",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  featureButtonArrow: {
    color: "#14200F",
    fontSize: 15,
    fontWeight: "800",
  },
  sectionBlock: {
    marginTop: 29,
  },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 13,
  },
  sectionTitle: {
    color: "#F1F4ED",
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  textAction: {
    color: "#B7DB7A",
    fontSize: 10,
    fontWeight: "800",
  },
  filterList: {
    gap: 8,
    paddingBottom: 14,
  },
  filterChip: {
    borderWidth: 1,
    borderColor: "#28342D",
    borderRadius: 14,
    paddingHorizontal: 13,
    paddingVertical: 8,
    backgroundColor: "#101A15",
  },
  filterChipActive: {
    backgroundColor: "#C7F36B",
    borderColor: "#C7F36B",
  },
  filterText: {
    color: "#A1ACA3",
    fontSize: 10,
    fontWeight: "700",
  },
  filterTextActive: {
    color: "#14200F",
  },
  matchList: {
    gap: 9,
  },
  matchCard: {
    borderRadius: 14,
    backgroundColor: "#111B16",
    borderWidth: 1,
    borderColor: "#243129",
    paddingHorizontal: 13,
    paddingTop: 12,
  },
  matchTopline: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  competitionLabel: {
    flexDirection: "row",
    alignItems: "center",
  },
  competitionDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#B9E372",
    marginRight: 6,
  },
  competitionText: {
    color: "#D9E2D7",
    fontSize: 9,
    fontWeight: "800",
  },
  regionText: {
    color: "#78847B",
    fontSize: 8,
    fontWeight: "700",
  },
  matchTime: {
    color: "#88948B",
    fontSize: 8,
    fontWeight: "700",
  },
  liveText: {
    color: "#C7F36B",
  },
  teamsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 14,
    paddingBottom: 12,
  },
  team: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  awayTeam: {
    justifyContent: "flex-end",
  },
  teamMark: {
    width: 25,
    height: 25,
    borderRadius: 8,
    backgroundColor: "#586D3D",
    alignItems: "center",
    justifyContent: "center",
  },
  redMark: {
    backgroundColor: "#B94441",
  },
  blueMark: {
    backgroundColor: "#395B88",
  },
  teamMarkText: {
    color: "#F4F6EF",
    fontSize: 11,
    fontWeight: "900",
  },
  teamName: {
    color: "#E6EBE2",
    fontSize: 10,
    fontWeight: "700",
    flexShrink: 1,
  },
  score: {
    color: "#F3F5EF",
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 0.8,
    marginHorizontal: 10,
  },
  versus: {
    color: "#718076",
    fontSize: 9,
    fontWeight: "900",
    marginHorizontal: 12,
  },
  cardFooter: {
    height: 29,
    borderTopWidth: 1,
    borderTopColor: "#243129",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardFooterText: {
    color: "#819087",
    fontSize: 8,
    fontWeight: "700",
  },
  chevron: {
    color: "#AECB7B",
    fontSize: 12,
  },
  emptyMessage: {
    color: "#88948B",
    fontSize: 12,
    paddingVertical: 16,
  },
  newsSection: {
    marginTop: 29,
  },
  newsCard: {
    borderWidth: 1,
    borderColor: "#26342B",
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#111B16",
  },
  newsArt: {
    height: 132,
    overflow: "hidden",
    justifyContent: "center",
    paddingLeft: 18,
    backgroundColor: "#273D2D",
  },
  newsOrb: {
    position: "absolute",
    width: 185,
    height: 185,
    right: -10,
    top: -25,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: "#57714A",
    backgroundColor: "#314C35",
  },
  newsArtLabel: {
    color: "#D8EEB0",
    fontSize: 19,
    lineHeight: 20,
    fontWeight: "900",
    letterSpacing: 2.2,
  },
  newsArtBall: {
    position: "absolute",
    right: 38,
    top: 35,
    color: "#D4EE9C",
    fontSize: 55,
  },
  newsCopy: {
    padding: 14,
  },
  newsCategory: {
    color: "#A8C976",
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 1.1,
  },
  newsTitle: {
    color: "#EFF2EA",
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "800",
    marginTop: 7,
  },
  newsByline: {
    color: "#758178",
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 1,
    marginTop: 11,
  },
  disclaimer: {
    color: "#58655B",
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 1,
    textAlign: "center",
    marginTop: 22,
  },
  matchError: {
    color: "#FF9D91",
    fontSize: 10,
    lineHeight: 16,
    marginTop: 9,
  },
  tabBar: {
    height: 68,
    borderTopWidth: 1,
    borderTopColor: "#223028",
    backgroundColor: "#0D1712",
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingBottom: 4,
  },
  tab: {
    alignItems: "center",
    justifyContent: "center",
    minWidth: 54,
    gap: 3,
  },
  tabIcon: {
    color: "#78847B",
    fontSize: 20,
    lineHeight: 22,
  },
  tabLabel: {
    color: "#78847B",
    fontSize: 8,
    fontWeight: "700",
  },
  tabActive: {
    color: "#C7F36B",
  },
});
