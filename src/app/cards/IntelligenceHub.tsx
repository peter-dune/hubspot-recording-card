import React, { useEffect, useState } from "react";
import {
  hubspot,
  useExtensionApi,
  Text,
  LoadingSpinner,
  ErrorState,
  Flex,
} from "@hubspot/ui-extensions";
import { Iframe } from "@hubspot/ui-extensions/experimental";

const PLAYER_BASE =
  "https://hubspot-recording-card-git-main-peter-6714s-projects.vercel.app";

hubspot.extend(() => <IntelligenceHubCard />);

function extractEngagementId(url: string): string | null {
  const match = url.match(/\/engagement\/(\d+)/);
  return match ? match[1] : null;
}

const IntelligenceHubCard = () => {
  const { actions, context } = useExtensionApi<"crm.record.tab">();
  const [hubUrl, setHubUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const recordId = context.crm.objectId;
    actions
      .fetchCrmObjectProperties(["recording_url"])
      .then((props) => {
        const recordingUrl = props["recording_url"];
        if (!recordingUrl) { setError("No recording on this record."); return; }
        const engagementId = extractEngagementId(recordingUrl);
        if (!engagementId) { setError("Could not parse engagement ID."); return; }

        const params = new URLSearchParams({ engagementId });
        if (recordId) params.set("recordId", String(recordId));
        setHubUrl(`${PLAYER_BASE}/hub?${params.toString()}`);
      })
      .catch(() => setError("Failed to load intelligence hub."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <Flex direction="column" align="center" justify="center"><LoadingSpinner label="Loading…" /></Flex>;
  }

  if (error || !hubUrl) {
    return <ErrorState title="Intelligence unavailable"><Text>{error ?? "No data found."}</Text></ErrorState>;
  }

  return <Iframe src={hubUrl} height={1500} />;
};
