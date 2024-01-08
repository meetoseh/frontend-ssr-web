export type OsehTranscriptRef = {
  /**
   * Primary stable external unique identifier for the transcript
   */
  uid: string;

  /**
   * A JWT which can be used to access the transcript
   */
  jwt: string;
};
