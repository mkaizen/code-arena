import React from 'react';
import { Link } from 'react-router-dom';

// In a real app, you might fetch this from your Fastify API or a static JSON manifest
const posts = [
  {
    slug: 'scaling-the-arena',
    title: 'Building Code Arena: Scaling WebSockets & Docker Sandboxes',
    date: '2026-07-14',
    author: 'Matthew',
    description: 'How we decoupled API spikes from our execution engine using BullMQ, Redis, and dynamic Docker cgroups.'
  }
];

export const BlogPage: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
      <h1 className="text-4xl font-extrabold text-white mb-8">Engineering Blog</h1>
      <div className="grid gap-8">
        {posts.map((post) => (
          <article key={post.slug} className="bg-gray-800 p-6 rounded-lg shadow-md border border-gray-700">
            <div className="text-sm text-gray-400 mb-2">
              {post.date} • By {post.author}
            </div>
            <h2 className="text-2xl font-bold text-blue-400 mb-3">
              <Link to={`/blog/${post.slug}`} className="hover:underline">
                {post.title}
              </Link>
            </h2>
            <p className="text-gray-300 mb-4">{post.description}</p>
            <Link 
              to={`/blog/${post.slug}`} 
              className="text-blue-500 hover:text-blue-400 font-semibold text-sm uppercase tracking-wider"
            >
              Read full post &rarr;
            </Link>
          </article>
        ))}
      </div>
    </div>
  );
};