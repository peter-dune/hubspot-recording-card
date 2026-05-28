import React, { useEffect, useState } from "react";
import {
  hubspot,
  useExtensionApi,
  Text,
  LoadingSpinner,
  ErrorState,
  Flex,
  Button,
  Link,
} from "@hubspot/ui-extensions";

const PLAYER_BASE =
  "https://hubspot-recording-card-git-main-peter-6714s-projects.vercel.app";

hubspot.extend(() => <RecordingCard />);

function extractEngagementId(url: string): string | null {
  const match = url.match(/\/engagement\/(\d+)/);
  return match ? match[1] : null;
}

const RecordingCard = () => {
  const { actions } = useExtensionApi<"crm.record.tab">();
  const [playerUrl, setPlayerUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    actions
      .fetchCrmObjectProperties(["recording_url"])
      .then((props) => {
        const recordingUrl = props["recording_url"];
        if (!recordingUrl) {
          setError("No recording URL on this record.");
          return;
        }
        const engagementId = extractEngagementId(recordingUrl);
        if (!engagementId) {
          setError("Could not parse engagement ID from recording URL.");
          return;
        }
        setPlayerUrl(`${PLAYER_BASE}?engagementId=${engagementId}`);
      })
      .catch(() => setError("Failed to load recording properties."))
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
      <Button
        onClick={() =>
          actions.openIframeModal({
            uri: playerUrl,
            height: 640,
            width: 960,
            title: "Call Recording",
          })
        }
      >
        ▶ Play Recording
      </Button>
      <Link href={playerUrl} target="blank">
        Open in full screen
      </Link>
    </Flex>
  );
};
