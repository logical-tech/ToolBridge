CREATE TABLE "tool_preference" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"toolkit_slug" text NOT NULL,
	"enabled_slugs" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tool_preference_user_toolkit" UNIQUE("user_id","toolkit_slug")
);
--> statement-breakpoint
ALTER TABLE "tool_preference" ADD CONSTRAINT "tool_preference_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;