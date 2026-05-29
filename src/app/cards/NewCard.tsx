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

hubspot.extend(() => <RecordingCard />);

function extractEngagementId(url: string): string | null {
  const match = url.match(/\/engagement\/(\d+)/);
  return match ? match[1] : null;
}

const RecordingCard = () => {
  const { actions, context, runServerlessFunction } =
    useExtensionApi<"crm.record.tab">();
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    actions
      .fetchCrmObjectProperties(["recording_url"])
      .then(async (props) => {
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

        const result = await runServerlessFunction({
          name: "hubspot_recording_card_app_function",
          parameters: {
            engagementId,
            portalId: String(context.portal.id),
          },
        });

        if (result.status === "SUCCESS" && result.response?.url) {
          setVideoUrl(result.response.url);
        } else {
          setError(result.response?.error || "Failed to fetch signed video URL.");
        }
      })
      .catch((e) => setError("Failed to load recording: " + e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <Flex direction="column" align="center" justify="center">
        <LoadingSpinner label="Loading recording…" />
      </Flex>
    );
  }

  if (error || !videoUrl) {
    return (
      <ErrorState title="Recording unavailable">
        <Text>{error ?? "No recording found."}</Text>
      </ErrorState>
    );
  }

  return <Iframe src={videoUrl} height="md" />;
};
