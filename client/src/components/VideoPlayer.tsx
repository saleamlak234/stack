import React, { useRef, useState, useEffect } from 'react';
import axios from 'axios';
import { env } from '../config/env';

interface Video {
    _id: string;
    title: string;
    description: string;
    videoUrl: string;
    thumbnailUrl?: string;
    duration: number;
    rewardAmount: number;
}

interface VideoPlayerProps {
    video: Video;
    onWatchComplete?: () => void;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({ video, onWatchComplete }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [watchId, setWatchId] = useState<string | null>(null);
    const [hasWatchedToday, setHasWatchedToday] = useState(false);
    const [generatedThumbnail, setGeneratedThumbnail] = useState<string | null>(null);
    const watchStartRef = useRef(false);

    useEffect(() => {
        // Start watch tracking when component mounts
        if (!watchStartRef.current) {
            watchStartRef.current = true;
            startWatchTracking();
        }

        // Generate thumbnail for all videos (always generate, don't check if exists)
        if (videoRef.current) {
            // Wait for video metadata to load
            const videoElement = videoRef.current;
            if (videoElement.readyState >= 1) { // HAVE_METADATA
                generateAndUploadThumbnail();
            } else {
                videoElement.addEventListener('loadedmetadata', generateAndUploadThumbnail, { once: true });
            }
        }

        return () => {
            watchStartRef.current = false;
        };
    }, [video._id]);

    const generateAndUploadThumbnail = async () => {
        try {
            const thumbnailDataUrl = await generateThumbnail();
            if (thumbnailDataUrl) {
                // Display generated thumbnail immediately (don't wait for upload)
                setGeneratedThumbnail(thumbnailDataUrl);
                
                // Upload to server in background (fire and forget)
                uploadThumbnail(thumbnailDataUrl).catch(error => {
                    console.error('Background thumbnail upload failed:', error);
                });
            }
        } catch (error) {
            console.error('Error generating thumbnail:', error);
        }
    };

    const startWatchTracking = async () => {
        try {
            const response = await axios.post(`${env.API_BASE_URL}/videos/${video._id}/watch`);
            if (response.data.watch) {
                setWatchId(response.data.watch._id);
                if (response.data.message === "Already watched today") {
                    setHasWatchedToday(true);
                }
            }
        } catch (error) {
            console.error('Error starting watch tracking:', error);
        }
    };

    const handleTimeUpdate = async () => {
        if (!videoRef.current || !watchId || hasWatchedToday) return;

        const currentTime = videoRef.current.currentTime;
        setCurrentTime(currentTime);

        try {
            await axios.put(`${env.API_BASE_URL}/videos/${video._id}/watch/${watchId}`, {
                watchDuration: Math.floor(currentTime),
                completed: currentTime >= video.duration * 0.9, // 90% watched
            });
        } catch (error) {
            console.error('Error updating watch progress:', error);
        }
    };

    const handleEnded = async () => {
        if (!watchId || hasWatchedToday) return;

        try {
            await axios.put(`${env.API_BASE_URL}/videos/${video._id}/watch/${watchId}`, {
                watchDuration: video.duration,
                completed: true,
            });

            setHasWatchedToday(true);
            if (onWatchComplete) {
                onWatchComplete();
            }
        } catch (error) {
            console.error('Error completing watch:', error);
        }
    };

    const generateThumbnail = async () => {
        if (!videoRef.current) return null;

        const video = videoRef.current;
        const originalTime = video.currentTime;

        // Wait for video to be ready
        if (video.readyState < 1) { // Less than HAVE_METADATA
            await new Promise((resolve) => {
                const onLoadedMetadata = () => {
                    video.removeEventListener('loadedmetadata', onLoadedMetadata);
                    resolve(void 0);
                };
                video.addEventListener('loadedmetadata', onLoadedMetadata);
            });
        }

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        if (!ctx) return null;

        // Set canvas size to match video dimensions
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        // Seek to 10% of video duration for thumbnail
        const thumbnailTime = Math.min(video.duration * 0.1, video.duration - 1);
        video.currentTime = thumbnailTime;

        // Wait for seek to complete and draw frame
        await new Promise((resolve) => {
            const onSeeked = () => {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                video.removeEventListener('seeked', onSeeked);
                video.currentTime = 0; // Reset to start
                resolve(void 0);
            };
            video.addEventListener('seeked', onSeeked);
        });

        // Convert canvas to data URL
        return canvas.toDataURL('image/jpeg', 0.8);
    };

    const uploadThumbnail = async (thumbnailDataUrl: string) => {
        try {
            // Convert data URL to blob
            const response = await fetch(thumbnailDataUrl);
            const blob = await response.blob();

            const formData = new FormData();
            formData.append('thumbnail', blob, `thumbnail-${video._id}.jpg`);

            const uploadResponse = await axios.post(`${env.API_BASE_URL}/videos/${video._id}/thumbnail`, formData);

            console.log('Thumbnail uploaded successfully:', uploadResponse.data);
            return uploadResponse.data.thumbnailUrl;
        } catch (error) {
            console.error('Error uploading thumbnail:', error);
            return null;
        }
    };

    const formatTime = (seconds: number): string => {
        if (!seconds || isNaN(seconds)) return '0:00';
        const minutes = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div className="relative w-full h-full overflow-hidden bg-black rounded-lg">
            <video
                ref={videoRef}
                src={video.videoUrl}
                poster={generatedThumbnail || video.thumbnailUrl}
                preload="metadata"
                className="object-contain w-full h-full "
                controls={!hasWatchedToday}
                crossOrigin="anonymous"
                onTimeUpdate={handleTimeUpdate}
                onEnded={handleEnded}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
            />

            <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black to-transparent">
                <div className="text-white">
                    <h3 className="text-lg font-semibold">{video.title}</h3>
                    <p className="text-sm opacity-90">{video.description}</p>

                    <div className="flex items-center justify-between mt-2">
                        <div className="flex items-center space-x-4 text-sm">
                            <span>{formatTime(currentTime)} / {formatTime(video.duration)}</span>
                            <span>Reward: {video.rewardAmount} ETB</span>
                        </div>

                        {hasWatchedToday && (
                            <div className="px-3 py-1 text-sm text-white bg-green-600 rounded-full">
                                ✓ Watched Today
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default VideoPlayer;