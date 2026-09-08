import { useCallback } from 'react';

interface AnalyticsEvent {
  action: string;
  category: string;
  label?: string;
  value?: number;
}

export const useAnalytics = () => {
  const trackEvent = useCallback((_event: AnalyticsEvent) => {
    // Ready for gtag when analytics is wired:
    // gtag('event', event.action, {
    //   event_category: event.category,
    //   event_label: event.label,
    //   value: event.value,
    // });
  }, []);

  const trackPageView = useCallback((page: string) => {
    trackEvent({
      action: 'page_view',
      category: 'navigation',
      label: page,
    });
  }, [trackEvent]);

  const trackUserAction = useCallback((action: string, category: string, label?: string) => {
    trackEvent({
      action,
      category,
      label,
    });
  }, [trackEvent]);

  const trackError = useCallback((error: Error, context?: string) => {
    trackEvent({
      action: 'error',
      category: 'error',
      label: `${context || 'unknown'}: ${error.message}`,
    });
  }, [trackEvent]);

  return {
    trackEvent,
    trackPageView,
    trackUserAction,
    trackError,
  };
}; 