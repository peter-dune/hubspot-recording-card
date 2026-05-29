import React, { useEffect, useState } from "react";
import {
  hubspot,
  useExtensionApi,
  Text,
  LoadingSpinner,
  ErrorState,
  Flex,
  Button,
  Tag,
  Divider,
} from "@hubspot/ui-extensions";

const PLAYER_BASE =
  "https://hubspot-recording-card-git-main-peter-6714s-projects.vercel.app";

hubspot.extend(() => <RecordingCard />);

function extractEngagementId(url: string): string | null {
  const match = url.match(/\/engagement\/(\d+)/);
  return match ? match[1] : null;
}

function formatDate(iso: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

const RecordingCard = () => {
  const { actions, context } = useExtensionApi<"crm.record.tab">();
  const [playerUrl, setPlayerUrl] = useState<string | null>(null);
  const [title, setTitle] = useState<string>("");
  const [host, setHost] = useState<string>("");
  const [date, setDate] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    actions
      .fetchCrmObjectProperties(["recording_url", "call_title", "call_name", "host", "call_date"])
      .then((props) => {
        const recordingUrl = props["recording_url"];
        if (!recordingUrl) { setError("No recording URL on this record."); return; }
        const engagementId = extractEngagementId(recordingUrl);
        if (!engagementId) { setError("Could not parse engagement ID."); return; }

        setTitle(props["call_title"] || props["call_name"] || "");
        setHost(props["host"] || "");
        setDate(formatDate(props["call_date"] || ""));

        const params = new URLSearchParams({ engagementId });
        const recordId = context.crm.objectId;
        if (recordId) params.set("recordId", String(recordId));
        setPlayerUrl(`${PLAYER_BASE}?${params.toString()}`);
      })
      .catch(() => setError("Failed to load recording."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <Flex direction="column" align="center" justify="center">
        <LoadingSpinner label="Loading…" />
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
    <Flex direction="column" gap="small">
      {/* Metadata row */}
      <Flex direction="row" gap="small" wrap="wrap">
        {date && <Tag><Text>{date}</Text></Tag>}
        {host && <Tag><Text>🎙 {host}</Text></Tag>}
      </Flex>

      {title && (
        <Text format={{ fontWeight: "bold" }}>{title}</Text>
      )}

      <Divider />

      {/* Play button */}
      <Button
        variant="primary"
        onClick={() =>
          actions.openIframeModal({
            uri: playerUrl,
            height: 600,
            width: 1100,
            title: title || "Call Recording",
          })
        }
      >
        ▶  Play Recording
      </Button>
    </Flex>
  );
};
