import { onCLS, onINP, onLCP, type Metric } from "web-vitals";
import { reportVital } from "./telemetry";

/**
 * Starts measuring the three Core Web Vitals once per page load, such as the Largest Contentful Paint of a product page.
 *
 * Only the metric name, value, and rating are reported. The `web-vitals` library also provides the page URL and
 * element details, but those can contain search text or product choices, so they are deliberately left out.
 */
export function startWebVitals(): void {
  const send = (metric: Metric) => reportVital({ name: metric.name, value: metric.value, rating: metric.rating });
  onCLS(send);
  onINP(send);
  onLCP(send);
}
