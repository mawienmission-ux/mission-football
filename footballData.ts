export type League = {
  id: string;
  name: string;
  country: string;
  region: string;
  logo_path: string | null;
};

export type Club = {
  id: string;
  name: string;
  short_name: string | null;
  country: string;
  logo_path: string | null;
};

export type Season = {
  id: string;
  league_id: string;
  name: string;
};

export type Standing = {
  id: string;
  season_id: string;
  club_id: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goals_for: number;
  goals_against: number;
  points: number;
};

export type Fixture = {
  id: string;
  league_id: string;
  season_id: string | null;
  home_club_id: string;
  away_club_id: string;
  kickoff_at: string;
  status: "scheduled" | "live" | "finished";
  home_score: number | null;
  away_score: number | null;
  minute: number | null;
};

export type FootballData = {
  leagues: League[];
  clubs: Club[];
  seasons: Season[];
  standings: Standing[];
  matches: Fixture[];
};
