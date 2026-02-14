
import youtube_transcript_api
from youtube_transcript_api import YouTubeTranscriptApi

print(f"File: {youtube_transcript_api.__file__}")
try:
    print(f"list_transcripts attr: {YouTubeTranscriptApi.list_transcripts}")
except AttributeError:
    print("list_transcripts missing")

try:
    print(f"get_transcript attr: {YouTubeTranscriptApi.get_transcript}")
except AttributeError:
    print("get_transcript missing")
