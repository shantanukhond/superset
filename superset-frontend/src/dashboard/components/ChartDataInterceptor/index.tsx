/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { nanoid } from 'nanoid';

// Aggregated responses by slice_id/chart_id
export type ChartDataResponses = Record<string, any>;

interface ChartDataInterceptorContextType {
  chartData: ChartDataResponses;
  clearChartData: () => void;
}

const ChartDataInterceptorContext = createContext<ChartDataInterceptorContextType | null>(null);

export const useChartDataInterceptor = () => {
  const context = useContext(ChartDataInterceptorContext);
  if (!context) {
    throw new Error('useChartDataInterceptor must be used within ChartDataInterceptorProvider');
  }
  return context;
};

interface ChartDataInterceptorProviderProps {
  children: ReactNode;
}

export const ChartDataInterceptorProvider: React.FC<ChartDataInterceptorProviderProps> = ({
  children,
}) => {
  const [chartData, setChartData] = useState<ChartDataResponses>({});
  const originalFetch = useRef<typeof fetch | null>(null);
  const originalXHROpen = useRef<typeof XMLHttpRequest.prototype.open | null>(null);
  const originalXHRSend = useRef<typeof XMLHttpRequest.prototype.send | null>(null);

  const clearChartData = () => {
    setChartData({});
  };

  // Helper function to extract slice_id from URL
  const extractSliceId = (urlString: string): string | null => {
    try {
      const url = new URL(urlString, window.location.origin);
      const formDataParam = url.searchParams.get('form_data');
      if (formDataParam) {
        const formData = JSON.parse(decodeURIComponent(formDataParam));
        return formData.slice_id?.toString() || null;
      }
    } catch (e) {
      // If parsing fails, try to extract from URL string directly
      const match = urlString.match(/form_data=.*?%7B%22slice_id%22%3A(\d+)%7D/);
      if (match) {
        return match[1];
      }
    }
    return null;
  };

  useEffect(() => {
    // Intercept fetch API calls
    // Store the original fetch - bind to window to preserve context
    const originalFetchFn = window.fetch.bind(window);
    originalFetch.current = originalFetchFn;
    
    // Create a wrapper function that preserves function identity for fetch-retry
    // Use function() instead of arrow function to ensure proper context
    const fetchWrapper = function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
      // Handle different input types to get URL string
      let urlString: string;
      if (typeof input === 'string') {
        urlString = input;
      } else if (input instanceof URL) {
        urlString = input.toString();
      } else {
        // Request object has url property
        urlString = (input as Request).url;
      }

      // Only intercept chart data API calls
      if (urlString && urlString.includes('/api/v1/chart/data')) {
        // Extract slice_id from URL
        const sliceId = extractSliceId(urlString);

        if (sliceId) {
          try {
            // Make the actual fetch call - originalFetchFn is already bound to window
            const responsePromise = originalFetchFn(input, init);
            
            // Handle response asynchronously
            responsePromise
              .then(response => {
                // Clone the response before reading to avoid consuming the original body
                const clonedResponse = response.clone();
                
                // Clone again for fallback text reading if JSON fails
                const clonedResponseForText = response.clone();

                // Read and store the response asynchronously without blocking
                clonedResponse
                  .json()
                  .then(json => {
                    // Extract only the data field from response.result[0].data
                    let extractedData = null;
                    if (json?.result && Array.isArray(json.result) && json.result.length > 0) {
                      extractedData = json.result[0]?.data || null;
                    }
                    
                    // Store data by slice_id
                    if (extractedData !== null) {
                      setChartData(prev => ({
                        ...prev,
                        [sliceId]: extractedData,
                      }));
                    }
                  })
                  .catch(() => {
                    // If response is not JSON, try text on the second clone
                    clonedResponseForText
                      .text()
                      .then(text => {
                        setChartData(prev => ({
                          ...prev,
                          [sliceId]: { error: 'Response is not JSON', text },
                        }));
                      })
                      .catch(() => {
                        setChartData(prev => ({
                          ...prev,
                          [sliceId]: { error: 'Failed to parse response' },
                        }));
                      });
                  });
                
                return response;
              })
              .catch(error => {
                // Store error by slice_id
                setChartData(prev => ({
                  ...prev,
                  [sliceId]: { error: String(error) },
                }));
              });

            return responsePromise;
          } catch (error) {
            // Store synchronous error
            setChartData(prev => ({
              ...prev,
              [sliceId]: { error: String(error) },
            }));
            throw error;
          }
        }
      }

      // For non-intercepted calls, use original fetch
      return originalFetchFn(input, init);
    };
    
    // Replace window.fetch with our wrapper
    window.fetch = fetchWrapper;

    // Intercept XMLHttpRequest
    originalXHROpen.current = XMLHttpRequest.prototype.open;
    originalXHRSend.current = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (...args) {
      const [method, url] = args;
      this._supersetInterceptedUrl = typeof url === 'string' ? url : url.toString();
      this._supersetInterceptedMethod = method;
      return originalXHROpen.current!.apply(this, args as any);
    };

    XMLHttpRequest.prototype.send = function (...args) {
      const url = this._supersetInterceptedUrl;
      const method = this._supersetInterceptedMethod;

      if (url && url.includes('/api/v1/chart/data')) {
        // Extract slice_id from URL
        const sliceId = extractSliceId(url);

        if (sliceId) {
          this.addEventListener('load', function () {
            try {
              const responseText = this.responseText;
              const json = JSON.parse(responseText);
              
              // Extract only the data field from response.result[0].data
              let extractedData = null;
              if (json?.result && Array.isArray(json.result) && json.result.length > 0) {
                extractedData = json.result[0]?.data || null;
              }
              
              // Store data by slice_id
              if (extractedData !== null) {
                setChartData(prev => ({
                  ...prev,
                  [sliceId]: extractedData,
                }));
              }
            } catch (e) {
              setChartData(prev => ({
                ...prev,
                [sliceId]: { error: 'Failed to parse response' },
              }));
            }
          });

          this.addEventListener('error', function () {
            setChartData(prev => ({
              ...prev,
              [sliceId]: { error: 'Request failed' },
            }));
          });
        }
      }

      return originalXHRSend.current!.apply(this, args);
    };

    // Cleanup
    return () => {
      if (originalFetch.current) {
        window.fetch = originalFetch.current;
      }
      if (originalXHROpen.current) {
        XMLHttpRequest.prototype.open = originalXHROpen.current;
      }
      if (originalXHRSend.current) {
        XMLHttpRequest.prototype.send = originalXHRSend.current;
      }
    };
  }, []);

  return (
    <ChartDataInterceptorContext.Provider value={{ chartData, clearChartData }}>
      {children}
    </ChartDataInterceptorContext.Provider>
  );
};
