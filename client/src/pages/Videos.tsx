import React, { useState, useEffect } from 'react';
import axios from 'axios';
import VideoPlayer from '../components/VideoPlayer';
import LoadingSpinner from '../components/LoadingSpinner';
import { Play, Clock, DollarSign, CheckCircle, ThumbsUp, Eye, TrendingUp } from 'lucide-react';

interface Video {
    _id: string;
    title: string;
    description: string;
    videoUrl: string;
    thumbnailUrl?: string;
    duration: number;
    rewardAmount: number;
    totalViews: number;

}

interface WatchHistory {
    _id: string;
    video: Video;
    watchedAt: string;
    rewardGiven: boolean;
}

const Videos: React.FC = () => {
    const [videos, setVideos] = useState<Video[]>([]);
    const [watchHistory, setWatchHistory] = useState<WatchHistory[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
    const [todayRewards, setTodayRewards] = useState(0);
    const [likedVideos, setLikedVideos] = useState<Set<string>>(new Set());

    const totalVideoRewards = videos.reduce((sum, video) => sum + video.rewardAmount, 0);

    useEffect(() => {
        fetchVideos();
        fetchWatchHistory();
        fetchTodayRewards();
    }, []);

    const fetchVideos = async () => {
        try {
            const response = await axios.get('/videos/active');
            setVideos(response.data.videos);
        } catch (error) {
            console.error('Error fetching videos:', error);
        }
    };

    const fetchWatchHistory = async () => {
        try {
            const response = await axios.get('/videos/history');
            setWatchHistory(response.data.watches);
        } catch (error) {
            console.error('Error fetching watch history:', error);
        }
    };

    const fetchTodayRewards = async () => {
        try {
            const response = await axios.get('/videos/rewards/today');
            setTodayRewards(response.data.todayRewards || 0);
        } catch (error) {
            console.error('Error fetching today rewards:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleLike = (videoId: string) => {
        setLikedVideos(prev => {
            const newLiked = new Set(prev);
            if (newLiked.has(videoId)) {
                newLiked.delete(videoId);
            } else {
                newLiked.add(videoId);
            }
            return newLiked;
        });
    };

    const handleWatchComplete = async () => {
        // Refresh watch history and today's rewards after completing a video
        await fetchWatchHistory();
        await fetchTodayRewards();
    };

    const formatDuration = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const hasWatchedToday = (videoId: string) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return watchHistory.some(watch =>
            watch?.video?._id === videoId &&
            watch.watchedAt &&
            new Date(watch.watchedAt) >= today &&
            watch.rewardGiven
        );
    };

    if (loading) {
        return <LoadingSpinner />;
    }

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="px-4 py-8 mx-auto max-w-7xl sm:px-6 lg:px-8">
                {/* Header with Today's Earnings */}
                <div className="mb-8">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-3xl font-bold text-gray-900">Watch & Earn</h1>
                            <p className="mt-2 text-gray-600">
                                Watch promotional videos and earn rewards. Each video can be watched once per day for rewards.
                            </p>
                        </div>
                        <div className="px-6 py-4 text-white shadow-lg bg-gradient-to-r from-green-500 to-green-600 rounded-xl">
                            <div className="flex items-center space-x-3">
                                <TrendingUp className="w-8 h-8" />
                                <div>
                                    <p className="text-sm opacity-90">Today's Earnings</p>
                                    <p className="text-2xl font-bold">{todayRewards?.toLocaleString()} Birr</p>

                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Today's Rewards Summary */}
                <div className="grid grid-cols-1 gap-6 mb-8 md:grid-cols-4 xl:grid-cols-5">
                    <div className="p-6 bg-white border border-gray-200 shadow-sm rounded-xl">
                        <div className="flex items-center">
                            <DollarSign className="w-8 h-8 text-green-600" />
                            <div className="ml-4">
                                <p className="text-sm text-gray-600">Today's Earnings</p>
                                <p className="text-2xl font-bold text-gray-900">
                                    {todayRewards?.toLocaleString()} Birr
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="p-6 bg-white border border-gray-200 shadow-sm rounded-xl">
                        <div className="flex items-center">
                            <Play className="w-8 h-8 text-blue-600" />
                            <div className="ml-4">
                                <p className="text-sm text-gray-600">Videos Watched Today</p>
                                <p className="text-2xl font-bold text-gray-900">
                                    {watchHistory.filter(watch => {
                                        const today = new Date();
                                        today.setHours(0, 0, 0, 0);
                                        return new Date(watch.watchedAt) >= today && watch.rewardGiven;
                                    }).length}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="p-6 bg-white border border-gray-200 shadow-sm rounded-xl">
                        <div className="flex items-center">
                            <CheckCircle className="w-8 h-8 text-purple-600" />
                            <div className="ml-4">
                                <p className="text-sm text-gray-600">Available Videos</p>
                                <p className="text-2xl font-bold text-gray-900">
                                    {videos.length}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="p-6 bg-white border border-gray-200 shadow-sm rounded-xl">
                        <div className="flex items-center">
                            <DollarSign className="w-8 h-8 text-emerald-600" />
                            <div className="ml-4">
                                <p className="text-sm text-gray-600">Total Video Rewards</p>
                                <p className="text-2xl font-bold text-gray-900">
                                    {totalVideoRewards.toLocaleString()} Birr
                                </p>
                            </div>
                        </div>
                    </div>

                  
                </div>

                {/* Video Player Modal */}
                {selectedVideo && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 bg-black bg-opacity-90">
                        <div className="w-full max-w-3xl overflow-hidden bg-white shadow-2xl rounded-3xl">
                            <div className="flex flex-col gap-2 px-4 py-0 border-b border-slate-200 bg-slate-50 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <p className="text-sm font-medium uppercase tracking-[0.12em] text-slate-500">Today's Reward</p>
                                    <p className="mt-1 text-2xl font-semibold text-slate-900">
                                        {todayRewards.toLocaleString()} Birr
                                    </p>
                                </div>
                                <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center">
                                    <div className="px-4 py-0 text-sm font-semibold text-white rounded-full shadow-sm bg-emerald-600">
                                        {todayRewards.toLocaleString()} Birr
                                    </div>
                                    <button
                                        onClick={() => setSelectedVideo(null)}
                                        className="px-4 py-0 text-sm font-semibold text-white transition rounded-full bg-slate-900 hover:bg-slate-700"
                                    >
                                        Close
                                    </button>
                                </div>
                            </div>
                            <div className="relative overflow-hidden bg-black aspect-video">
                                <VideoPlayer
                                    video={selectedVideo}
                                    onWatchComplete={handleWatchComplete}
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* Videos Grid - YouTube Style */}
                <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                    {videos.map((video) => {
                        const watched = hasWatchedToday(video._id);
                        const isLiked = likedVideos.has(video._id);
                        return (
                            <div
                                key={video._id}
                                className="overflow-hidden transition-all duration-300 bg-white shadow-sm rounded-xl hover:shadow-lg group"
                            >
                                {/* Video Thumbnail - YouTube Style */}
                                <div className="relative overflow-hidden bg-gray-900 aspect-video">
                                    {video.thumbnailUrl ? (
                                        <img
                                            src={video.thumbnailUrl}
                                            alt={video.title}
                                            className="object-cover w-full h-full transition-transform duration-300 group-hover:scale-105"
                                        />
                                    ) : (
                                        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900">
                                            <Play className="w-16 h-16 text-gray-400" />
                                        </div>
                                    )}

                                    {/* Play Button Overlay */}
                                    <div className="absolute inset-0 flex items-center justify-center transition-opacity duration-300 opacity-0 group-hover:opacity-100">
                                        <button
                                            onClick={() => setSelectedVideo(video)}
                                            className="flex items-center justify-center w-20 h-20 text-white transition-colors bg-red-600 rounded-full shadow-lg hover:bg-red-700"
                                            disabled={watched}
                                        >
                                            <Play className="w-8 h-8 ml-1" fill="white" />
                                        </button>
                                    </div>

                                    {/* Reward Badge */}
                                    <div className="absolute inline-flex items-center px-3 py-1 text-xs font-semibold text-white rounded-full shadow-sm top-2 left-2 bg-emerald-600">
                                        +{video.rewardAmount} Birr
                                    </div>

                                    {/* Duration Badge */}
                                    <div className="absolute px-2 py-1 text-xs text-white bg-black rounded bottom-2 right-2 bg-opacity-80">
                                        {formatDuration(video.duration)}
                                    </div>

                                    {/* Watched Badge */}
                                    {watched && (
                                        <div className="absolute flex items-center px-2 py-1 text-xs text-white bg-green-600 rounded-full top-2 right-2">
                                            <CheckCircle className="w-3 h-3 mr-1" />
                                            Watched
                                        </div>
                                    )}
                                </div>

                                {/* Video Info - YouTube Style */}
                                <div className="p-3">
                                    <h3 className="mb-2 text-base font-semibold leading-tight text-gray-900 cursor-pointer line-clamp-2 hover:text-blue-600">
                                        {video.title}
                                    </h3>

                                    <p className="mb-2 text-sm text-gray-600 line-clamp-2">
                                        {video.description}
                                    </p>

                                    {/* Stats Row */}
                                    <div className="flex items-center justify-between mb-2 text-xs text-gray-500">
                                        <div className="flex items-center space-x-4">
                                            <div className="flex items-center">
                                                <Eye className="w-4 h-4 mr-1" />
                                                {video.totalViews.toLocaleString()} views
                                            </div>
                                            <div className="flex items-center font-medium text-green-600">
                                                <DollarSign className="w-4 h-4 mr-1" />
                                                +{video.rewardAmount} Birr
                                            </div>
                                        </div>
                                    </div>

                                    {/* Action Buttons */}
                                    <div className="flex items-center justify-between mt-2">
                                        <button
                                            onClick={() => handleLike(video._id)}
                                            className={`flex items-center space-x-1 px-2 py-1 rounded-md transition-colors ${isLiked
                                                ? 'bg-red-50 text-red-600 hover:bg-red-100'
                                                : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                                                }`}
                                        >
                                            <ThumbsUp className={`w-3 h-3 ${isLiked ? 'fill-current' : ''}`} />
                                            <span className="text-xs font-medium">
                                                {isLiked ? 'Liked' : 'Like'}
                                            </span>
                                        </button>

                                        <button
                                            onClick={() => setSelectedVideo(video)}
                                            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${watched
                                                ? 'bg-gray-100 text-gray-500 cursor-not-allowed'
                                                : 'bg-blue-600 text-white hover:bg-blue-700'
                                                }`}
                                            disabled={watched}
                                        >
                                            {watched ? 'Watched' : 'Watch'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {videos.length === 0 && (
                    <div className="py-12 text-center">
                        <Play className="w-16 h-16 mx-auto text-gray-400" />
                        <h3 className="mt-4 text-lg font-medium text-gray-900">No videos available</h3>
                        <p className="mt-2 text-gray-600">Check back later for new promotional videos.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Videos;