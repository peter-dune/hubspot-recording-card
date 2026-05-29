import React, { useEffect, useState } from "react";
import {
  hubspot,
  useExtensionApi,
  Text,
  LoadingSpinner,
  ErrorState,
  Flex,
  Button,
} from "@hubspot/ui-extensions";

const PLAYER_BASE =
  "https://hubspot-recording-card-git-main-peter-6714s-projects.vercel.app";

hubspot.extend(() => <RecordingCard />);

function extractEngagementId(url: string): string | null {
  const match = url.match(/\/engagement\/(\d+)/);
  return match ? match[1] : null;
}

const RecordingCard = () => {
  const { actions, context } = useExtensionApi<"crm.record.tab">();
  const [playerUrl, setPlayerUrl] = useState<string | null>(null);
  const [title, setTitle] = useState<string>("Call Recording");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    actions
      .fetchCrmObjectProperties(["recording_url", "call_title", "call_name", "host", "call_date"])
      .then((props) => {
        const recordingUrl = props["recording_url"];
        if (!recordingUrl) {
          setError("No recording URL on this record.");
          return;
        }
        const engagementId = extractEngagementId(recordingUrl);
        if (!engagementId) {
          setError("Could not parse engagement ID.");
          return;
        }

        const callTitle = props["call_title"] || props["call_name"] || "Call Recording";
        setTitle(callTitle);

        const recordId = context.crm.objectId;
        const params = new URLSearchParams({ engagementId });
        if (recordId) params.set("recordId", String(recordId));

        setPlayerUrl(`${PLAYER_BASE}?${params.toString()}`);
      })
      .catch(() => setError("Failed to load recording."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <Flex direction="column" align="center" justify="center">
        <LoadingSpinner label="Loading recording…" />
      </Flex>
    );
  }

  if (error || !playerUrl) {
    return (
      <ErrorState title="Recording unavailable">
        <Text>{error ?? "No recording found."}</Text>
      </ErrorState>
    );
  }

  return (
    <Flex direction="column" gap="medium">
      <Text format={{ fontWeight: "bold" }}>{title}</Text>
      <Button
        variant="primary"
        onClick={() =>
          actions.openIframeModal({
            uri: playerUrl,
            height: 600,
            width: 1100,
            title: title,
          })
        }
      >
        ▶ Play Recording
      </Button>
    </Flex>
  );
};
