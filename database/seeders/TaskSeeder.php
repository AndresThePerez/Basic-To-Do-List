<?php

namespace Database\Seeders;

use Carbon\Carbon;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class TaskSeeder extends Seeder
{
    /**
     * Run the database seeds.
     *
     * @return void
     */
    public function run()
    {
        // minutes_left: null → kept task (no expiry); otherwise the countdown
        // shown in the UI. Bands: urgent (< 60m, pulses), mid-range, near-full.
        $notes = [
            // Work (category_id: 1)
            [
                'category_id' => 1,
                'title' => 'Q2 Sprint Planning',
                'body' => 'Prepare backlog items and estimate story points for the next sprint cycle',
                'created_at' => Carbon::now()->subDays(5),
                'minutes_left' => null,
            ],
            [
                'category_id' => 1,
                'title' => 'Update API Documentation',
                'body' => 'Document the new endpoints for the user management module',
                'minutes_left' => rand(15, 55),
            ],
            [
                'category_id' => 1,
                'title' => 'Code Review Feedback',
                'body' => 'Address PR comments on the authentication refactor before merging',
                'minutes_left' => rand(240, 420),
            ],

            // Personal (category_id: 2)
            [
                'category_id' => 2,
                'title' => 'Book Dentist Appointment',
                'body' => 'Schedule a cleaning for sometime next month, morning preferred',
                'created_at' => Carbon::now()->subDays(7),
                'minutes_left' => null,
            ],
            [
                'category_id' => 2,
                'title' => 'Plan Weekend Hike',
                'body' => 'Research trails near Mt. Rainier, pack gear and check weather forecast',
                'minutes_left' => rand(480, 600),
            ],

            // Shopping (category_id: 3)
            [
                'category_id' => 3,
                'title' => 'Grocery Run',
                'body' => 'Eggs, milk, bread, chicken, spinach, olive oil, and coffee beans',
                'minutes_left' => rand(20, 50),
            ],
            [
                'category_id' => 3,
                'title' => 'New Monitor Stand',
                'body' => 'Look for an adjustable dual monitor arm that clamps to the desk',
                'minutes_left' => rand(300, 480),
            ],

            // Health (category_id: 4)
            [
                'category_id' => 4,
                'title' => 'Morning Run Schedule',
                'body' => 'Run 3 miles on Monday, Wednesday, Friday before work',
                'minutes_left' => rand(620, 700),
            ],
            [
                'category_id' => 4,
                'title' => 'Meal Prep Sunday',
                'body' => 'Prep grilled chicken, brown rice, and roasted vegetables for the week',
                'minutes_left' => rand(90, 200),
            ],

            // Finance (category_id: 5)
            [
                'category_id' => 5,
                'title' => 'Review Monthly Budget',
                'body' => 'Check spending against budget categories and adjust savings goals',
                'created_at' => Carbon::now()->subDays(8),
                'minutes_left' => null,
            ],
            [
                'category_id' => 5,
                'title' => 'Renew Car Insurance',
                'body' => 'Policy expires next month, compare quotes from at least three providers',
                'minutes_left' => rand(400, 560),
            ],

            // Education (category_id: 6)
            [
                'category_id' => 6,
                'title' => 'Finish Laravel Course',
                'body' => 'Complete the remaining sections on middleware, events, and queues',
                'created_at' => Carbon::now()->subDays(10),
                'minutes_left' => null,
            ],
            [
                'category_id' => 6,
                'title' => 'Read Clean Code Ch. 5-7',
                'body' => 'Focus on formatting, objects vs data structures, and error handling chapters',
                'minutes_left' => rand(600, 690),
            ],
        ];

        foreach ($notes as $note) {
            if ($note['minutes_left'] !== null) {
                $expiresAt = Carbon::now()->addMinutes($note['minutes_left']);
                $createdAt = $expiresAt->copy()->subHours(12);
            } else {
                $expiresAt = null;
                $createdAt = $note['created_at'];
            }

            DB::table('tasks')->insert([
                'category_id' => $note['category_id'],
                'title' => $note['title'],
                'body' => $note['body'],
                'expires_at' => $expiresAt,
                'created_at' => $createdAt,
                'updated_at' => $createdAt,
            ]);
        }

        // Soft-deleted notes for the History page
        $deletedNotes = [
            [
                'category_id' => 1,
                'title' => 'Old Standup Notes',
                'body' => 'Notes from last month daily standups, no longer relevant',
                'created_at' => Carbon::now()->subDays(30),
                'deleted_at' => Carbon::now()->subDays(10),
            ],
            [
                'category_id' => 2,
                'title' => 'Cancel Gym Membership',
                'body' => 'Switch from downtown gym to the one closer to home',
                'created_at' => Carbon::now()->subDays(20),
                'deleted_at' => Carbon::now()->subDays(5),
            ],
        ];

        foreach ($deletedNotes as $note) {
            DB::table('tasks')->insert([
                'category_id' => $note['category_id'],
                'title' => $note['title'],
                'body' => $note['body'],
                'created_at' => $note['created_at'],
                'updated_at' => $note['created_at'],
                'deleted_at' => $note['deleted_at'],
            ]);
        }
    }
}
