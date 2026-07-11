<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Gate;

// This file is read by the rule-test only; it is not autoloaded.
function fixture_raw_permission(): void
{
    Gate::allows('ping.view'); // <-- should be flagged
}
