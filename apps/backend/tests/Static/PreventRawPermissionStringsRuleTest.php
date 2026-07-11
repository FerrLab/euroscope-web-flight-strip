<?php

declare(strict_types=1);

namespace Tests\Static;

use App\Static\PreventRawPermissionStrings;
use PHPStan\Rules\Rule;
use PHPStan\Testing\RuleTestCase;

/** @extends RuleTestCase<PreventRawPermissionStrings> */
class PreventRawPermissionStringsRuleTest extends RuleTestCase
{
    protected function getRule(): Rule
    {
        return new PreventRawPermissionStrings;
    }

    public function test_flags_raw_permission_string(): void
    {
        $this->analyse(
            [__DIR__.'/RawPermissionFixture.php'],
            [
                [
                    'Raw permission string "ping.view" passed to Illuminate\\Support\\Facades\\Gate::allows — use a BackedEnum implementing App\\Authorization\\Contracts\\Permission instead.',
                    10,
                ],
            ],
        );
    }
}
